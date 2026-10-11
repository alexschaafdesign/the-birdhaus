// Birdhaus accounts (the `users` table): crew and staff, invited from
// /admin/crew. The admin creates a row with roles and emails a set-password
// link; accepting it activates the account. The same token machinery doubles
// as password reset. Rows that hold no crew/staff role (former Song Club
// members, kept until Phase 5 Deploy C) can't sign in here.

import { cookies } from 'next/headers';
import { sql } from '../db';
import {
  ACCOUNT_SESSION_COOKIE,
  createSetupToken,
  hashPassword,
  hashSetupToken,
  verifyAccountSessionToken,
  verifyPassword,
} from './auth';

export type AccountStatus = 'invited' | 'active' | 'disabled';

// Roles: crew and staff (lib/accounts/roles.ts, client-safe, re-exported).
export { ALL_ROLES, type AccountRole } from './roles';
import { ALL_ROLES, isBirdhausAccount, type AccountRole } from './roles';
import { sanitizeFocusAreas, type FocusAreaKey } from '../crew';

// A labeled profile link (Bandcamp, Instagram, website…) shown on attendee
// cards.
export interface ProfileLink {
  label: string;
  url: string;
}

export interface UserAccount {
  id: number;
  email: string;
  name: string;
  status: AccountStatus;
  has_password: boolean;
  avatar_url: string | null;
  bio: string | null;
  links: ProfileLink[];
  notify_track_comments: boolean;
  notify_announcements: boolean;
  notify_events: boolean;
  roles: AccountRole[];
  // Crew-only: free-text job title ("VP of Sound Engineering") and the focus
  // areas (lib/crew.ts keys) that drive their tailored /admin home. Null/empty
  // for non-crew members.
  title: string | null;
  focus_areas: FocusAreaKey[];
  invited_at: string;
  joined_at: string | null;
  last_seen_at: string | null;
  // Session-revocation counter (080): tokens embed it at issue time and die
  // when it's bumped (password change/reset, disable). Not secret — forging a
  // token still requires the HMAC secret.
  session_epoch: number;
}

const MAX_LINKS = 8;

// Keeps only well-formed {label,url} entries with an http(s) url; caps the count.
export function sanitizeLinks(input: unknown): ProfileLink[] {
  if (!Array.isArray(input)) return [];
  const out: ProfileLink[] = [];
  for (const raw of input) {
    if (out.length >= MAX_LINKS) break;
    if (!raw || typeof raw !== 'object') continue;
    const label = typeof (raw as ProfileLink).label === 'string' ? (raw as ProfileLink).label.trim().slice(0, 40) : '';
    let url = typeof (raw as ProfileLink).url === 'string' ? (raw as ProfileLink).url.trim() : '';
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    out.push({ label: label || new URL(url).hostname.replace(/^www\./, ''), url });
  }
  return out;
}

const INVITE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // invites linger a month
const RESET_TOKEN_TTL_SECONDS = 60 * 60 * 2; // resets are short-lived

const COLUMNS = sql`
  id::int as id, email, name, status, (password_hash is not null) as has_password,
  avatar_url, bio, links, notify_track_comments, notify_announcements, notify_events,
  (select coalesce(array_agg(r.role order by r.role), '{}')
     from user_roles r where r.user_id = users.id and r.role in ('crew', 'staff')) as roles,
  title, focus_areas, session_epoch,
  invited_at::text as invited_at, joined_at::text as joined_at,
  last_seen_at::text as last_seen_at
`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// The crew/staff roles in `roles`, deduplicated; anything else is dropped.
function sanitizeRoles(roles: unknown): AccountRole[] {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.filter((r): r is AccountRole => ALL_ROLES.includes(r as AccountRole)))];
}

export async function getMemberById(id: number): Promise<UserAccount | null> {
  const [row] = await sql<UserAccount[]>`
    select ${COLUMNS} from users where id = ${id}
  `;
  return row ?? null;
}

// Creates (or re-invites) a user with the given roles and returns the raw
// setup token for the invite email. `title`/`focusAreas` are the crew fields
// (a re-invite that omits them leaves any existing ones untouched).
export async function inviteMember(input: {
  email: string;
  name: string;
  roles: AccountRole[];
  title?: string | null;
  focusAreas?: unknown;
}): Promise<{ member: UserAccount; token: string } | { error: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !name) return { error: 'Name and email are required' };
  const roles = sanitizeRoles(input.roles);
  if (roles.length === 0) return { error: 'Pick at least one role' };
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) || null : null;
  const focusAreas = input.focusAreas === undefined ? [] : sanitizeFocusAreas(input.focusAreas);

  const { token, tokenHash } = createSetupToken();
  // Re-inviting an existing address refreshes their token and roles (never
  // wiping an already-set password); the conflict-update's WHERE makes
  // inviting a disabled user a no-op instead of quietly re-arming it. Crew
  // fields only overwrite when the caller actually supplied them (coalesce /
  // non-empty check), so a bare re-invite can't blank a crew title.
  const [row] = await sql<Array<{ id: number }>>`
    insert into users (email, name, setup_token_hash, setup_token_expires_at, title, focus_areas)
    values (${email}, ${name}, ${tokenHash},
            now() + make_interval(secs => ${INVITE_TOKEN_TTL_SECONDS}),
            ${title}, ${focusAreas})
    on conflict (email) do update set
      name = excluded.name,
      setup_token_hash = excluded.setup_token_hash,
      setup_token_expires_at = excluded.setup_token_expires_at,
      title = coalesce(excluded.title, users.title),
      focus_areas = case
        when cardinality(excluded.focus_areas) > 0 then excluded.focus_areas
        else users.focus_areas
      end,
      invited_at = now()
    where users.status <> 'disabled'
    returning id
  `;
  if (!row) return { error: 'That member is disabled — re-enable them first' };

  await setRoles(Number(row.id), roles);
  const member = await getMemberById(Number(row.id));
  if (!member) return { error: 'Invite failed' };
  return { member, token };
}

// Replaces the account's crew/staff roles. Any other role row (song_club/band,
// left from before the Songhaus split) is untouched. Losing `staff` bumps the
// session epoch, so an admin cookie issued while they had it dies on its next
// request instead of lasting until it expires.
export async function setRoles(userId: number, roles: unknown): Promise<void> {
  const clean = sanitizeRoles(roles);
  await sql.begin(async (tx) => {
    const before = await tx<Array<{ role: string }>>`
      select role from user_roles where user_id = ${userId} and role in ${tx(ALL_ROLES)}
    `;
    await tx`delete from user_roles where user_id = ${userId} and role in ${tx(ALL_ROLES)}`;
    for (const role of clean) {
      await tx`insert into user_roles (user_id, role) values (${userId}, ${role})`;
    }
    if (before.some((r) => r.role === 'staff') && !clean.includes('staff')) {
      await tx`update users set session_epoch = session_epoch + 1 where id = ${userId}`;
    }
  });
}

// Birdhaus accounts: everyone holding crew or staff, by name.
export async function listCrew(): Promise<UserAccount[]> {
  return sql<UserAccount[]>`
    select ${COLUMNS} from users
    where exists (
      select 1 from user_roles r where r.user_id = users.id and r.role in ${sql(ALL_ROLES)}
    )
    order by name asc, id asc
  `;
}

// Updates a crew member's title and/or focus areas. `title: null` clears it;
// `focusAreas` fully replaces the set. Either field can be omitted to leave it
// as-is.
export async function updateCrewFields(
  id: number,
  input: { title?: string | null; focusAreas?: unknown }
): Promise<UserAccount | null> {
  const hasTitle = input.title !== undefined;
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) || null : null;
  const hasFocus = input.focusAreas !== undefined;
  const focusAreas = sanitizeFocusAreas(input.focusAreas);
  const [row] = await sql<Array<{ id: number }>>`
    update users set
      title = ${hasTitle ? title : sql`title`},
      focus_areas = ${hasFocus ? focusAreas : sql`focus_areas`}
    where id = ${id}
    returning id
  `;
  return row ? getMemberById(Number(row.id)) : null;
}

// Refreshes the setup token for an existing (non-disabled) user — used by
// both "resend invite" and "forgot password". Returns null if no such user.
export async function refreshSetupToken(
  memberId: number,
  purpose: 'invite' | 'reset'
): Promise<{ member: UserAccount; token: string } | null> {
  const ttl = purpose === 'invite' ? INVITE_TOKEN_TTL_SECONDS : RESET_TOKEN_TTL_SECONDS;
  const { token, tokenHash } = createSetupToken();
  const [row] = await sql<Array<{ id: number }>>`
    update users set
      setup_token_hash = ${tokenHash},
      setup_token_expires_at = now() + make_interval(secs => ${ttl})
    where id = ${memberId} and status <> 'disabled'
    returning id
  `;
  if (!row) return null;
  const member = await getMemberById(Number(row.id));
  return member ? { member, token } : null;
}

// Resolves a raw setup token from an emailed link to its user. null =
// unknown, already used, or expired.
export async function getMemberBySetupToken(token: string): Promise<UserAccount | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await sql<UserAccount[]>`
    select ${COLUMNS} from users
    where setup_token_hash = ${hashSetupToken(token)}
      and setup_token_expires_at > now()
      and status <> 'disabled'
  `;
  return row ?? null;
}

// Consumes a setup token: sets the password, activates the account, clears
// the token (single-use). Returns the user, or null if the token was invalid.
export async function acceptSetupToken(
  token: string,
  password: string
): Promise<UserAccount | null> {
  const member = await getMemberBySetupToken(token);
  if (!member) return null;

  const passwordHash = await hashPassword(password);
  // session_epoch bump: a password (re)set kills every outstanding session —
  // this is what makes "reset your password" actually log out a stolen cookie.
  const [row] = await sql<Array<{ id: number }>>`
    update users set
      password_hash = ${passwordHash},
      status = 'active',
      session_epoch = session_epoch + 1,
      joined_at = coalesce(joined_at, now()),
      setup_token_hash = null,
      setup_token_expires_at = null
    where id = ${member.id} and setup_token_hash = ${hashSetupToken(token)}
    returning id
  `;
  return row ? getMemberById(Number(row.id)) : null;
}

// For login: the one query that needs the password hash. Roles ride along so
// the login route can decide whether to also grant the admin cookie (staff).
export async function getLoginRow(email: string): Promise<{
  id: number;
  password_hash: string | null;
  status: AccountStatus;
  roles: AccountRole[];
  session_epoch: number;
} | null> {
  const [row] = await sql<
    Array<{
      id: number;
      password_hash: string | null;
      status: AccountStatus;
      roles: AccountRole[];
      session_epoch: number;
    }>
  >`
    select id, password_hash, status, session_epoch,
           (select coalesce(array_agg(r.role order by r.role), '{}')
              from user_roles r where r.user_id = users.id and r.role in ('crew', 'staff')) as roles
    from users where email = ${normalizeEmail(email)}
  `;
  return row ?? null;
}

export async function setMemberStatus(
  id: number,
  status: 'active' | 'disabled'
): Promise<UserAccount | null> {
  // Enabling someone who never accepted their invite returns them to
  // 'invited' (they still have no password to log in with). Disabling bumps
  // the session epoch so every outstanding session — including a staff
  // account's admin cookie — dies on its next request, not when it expires.
  const [row] = await sql<Array<{ id: number }>>`
    update users set
      status = case
        when ${status} = 'active' and password_hash is null then 'invited'
        else ${status}
      end,
      session_epoch = session_epoch + case when ${status} = 'disabled' then 1 else 0 end
    where id = ${id}
    returning id
  `;
  return row ? getMemberById(Number(row.id)) : null;
}

export async function deleteMember(id: number): Promise<boolean> {
  const result = await sql`delete from users where id = ${id}`;
  return result.count > 0;
}

export async function touchLastSeen(id: number): Promise<void> {
  await sql`update users set last_seen_at = now() where id = ${id}`;
}

// --- self-service account settings (/account) ---

export async function updateProfile(
  id: number,
  input: {
    name?: string;
    bio?: string | null;
    links?: unknown;
    notifyTrackComments?: boolean;
    notifyAnnouncements?: boolean;
    notifyEvents?: boolean;
  }
): Promise<UserAccount | null> {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) || null : null;
  const hasBio = input.bio !== undefined;
  const bio = input.bio?.trim().slice(0, 1000) || null;
  const hasLinks = input.links !== undefined;
  // sql.json's type wants a JSON object; an array of {label,url} is valid JSON
  // but trips its index-signature check, so coerce to the expected param type.
  const linksJson = sanitizeLinks(input.links) as unknown as Parameters<typeof sql.json>[0];
  const [row] = await sql<Array<{ id: number }>>`
    update users set
      name = coalesce(${name}, name),
      bio = ${hasBio ? bio : sql`bio`},
      links = ${hasLinks ? sql.json(linksJson) : sql`links`},
      notify_track_comments = coalesce(${input.notifyTrackComments ?? null}, notify_track_comments),
      notify_announcements = coalesce(${input.notifyAnnouncements ?? null}, notify_announcements),
      notify_events = coalesce(${input.notifyEvents ?? null}, notify_events)
    where id = ${id}
    returning id
  `;
  return row ? getMemberById(id) : null;
}

export async function setAvatar(id: number, url: string): Promise<void> {
  await sql`update users set avatar_url = ${url} where id = ${id}`;
}

// Change password with current-password verification. Bumps the session epoch
// so every other session logs out; returns the new epoch (the caller re-issues
// this device's cookies with it), or null when the current password doesn't
// match (or the user is gone).
export async function changePassword(
  id: number,
  currentPassword: string,
  newPassword: string
): Promise<number | null> {
  const [row] = await sql<Array<{ password_hash: string | null }>>`
    select password_hash from users where id = ${id} and status = 'active'
  `;
  if (!row?.password_hash) return null;
  if (!(await verifyPassword(currentPassword, row.password_hash))) return null;
  const hash = await hashPassword(newPassword);
  const [updated] = await sql<Array<{ session_epoch: number }>>`
    update users set password_hash = ${hash}, session_epoch = session_epoch + 1
    where id = ${id}
    returning session_epoch
  `;
  return updated ? Number(updated.session_epoch) : null;
}

// The logged-in account for the current request, from the session cookie.
// Re-loads the row so a disabled/deleted user, a token from before the last
// password change (stale epoch), or an account with no crew/staff role left
// is treated as signed out immediately, signed cookie or not.
export async function getSessionAccount(): Promise<UserAccount | null> {
  const token = (await cookies()).get(ACCOUNT_SESSION_COOKIE)?.value;
  const info = verifyAccountSessionToken(token);
  if (info === null) return null;
  const member = await getMemberById(info.memberId);
  return member &&
    member.status === 'active' &&
    Number(member.session_epoch) === info.epoch &&
    isBirdhausAccount(member.roles)
    ? member
    : null;
}
