// Site-wide user accounts (the `users` table — Song Club members, crew,
// admin assistants). Invite-only: the admin creates a row with roles and
// emails a set-password link; accepting it activates the account. The same
// token machinery doubles as password reset.

import { cookies } from 'next/headers';
import { sql } from './db';
import { isAdminSession } from './admin-session';
import {
  CLUB_SESSION_COOKIE,
  createSetupToken,
  hashPassword,
  hashSetupToken,
  verifyClubSessionToken,
  verifyPassword,
} from './club-auth';

export type ClubMemberStatus = 'invited' | 'active' | 'disabled';

// What a login can reach: song_club = /club portal; crew = future
// engineer/photographer pages; staff = the full admin dashboard; band = the
// Yellow Ostrich workspace at /yellow-ostrich. Constants live in
// club-roles.ts (client-safe) and are re-exported here.
export { ALL_ROLES, type ClubRole } from './club-roles';
import { ALL_ROLES, type ClubRole } from './club-roles';
import { sanitizeFocusAreas, type FocusAreaKey } from './crew';

// A labeled profile link (Bandcamp, Instagram, website…) shown on attendee
// cards.
export interface ProfileLink {
  label: string;
  url: string;
}

export interface ClubMember {
  id: number;
  email: string;
  name: string;
  status: ClubMemberStatus;
  has_password: boolean;
  avatar_url: string | null;
  bio: string | null;
  links: ProfileLink[];
  notify_track_comments: boolean;
  notify_announcements: boolean;
  notify_events: boolean;
  roles: ClubRole[];
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
  id, email, name, status, (password_hash is not null) as has_password,
  avatar_url, bio, links, notify_track_comments, notify_announcements, notify_events,
  (select coalesce(array_agg(r.role order by r.role), '{}')
     from user_roles r where r.user_id = users.id) as roles,
  title, focus_areas, session_epoch,
  invited_at::text as invited_at, joined_at::text as joined_at,
  last_seen_at::text as last_seen_at
`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeRoles(roles: unknown): ClubRole[] {
  if (!Array.isArray(roles)) return ['song_club'];
  const valid = roles.filter((r): r is ClubRole => ALL_ROLES.includes(r as ClubRole));
  return valid.length > 0 ? [...new Set(valid)] : ['song_club'];
}

export async function listMembers(): Promise<ClubMember[]> {
  return sql<ClubMember[]>`
    select ${COLUMNS} from users order by name asc, id asc
  `;
}

export async function getMemberById(id: number): Promise<ClubMember | null> {
  const [row] = await sql<ClubMember[]>`
    select ${COLUMNS} from users where id = ${id}
  `;
  return row ?? null;
}

// Creates (or re-invites) a user with the given roles and returns the raw
// setup token for the invite email. `title`/`focusAreas` are the crew fields —
// omit them for a plain Song Club invite (a re-invite that omits them leaves
// any existing crew fields untouched).
export async function inviteMember(input: {
  email: string;
  name: string;
  roles?: unknown;
  title?: string | null;
  focusAreas?: unknown;
}): Promise<{ member: ClubMember; token: string } | { error: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !name) return { error: 'Name and email are required' };
  const roles = sanitizeRoles(input.roles);
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) || null : null;
  const focusAreas = input.focusAreas === undefined ? [] : sanitizeFocusAreas(input.focusAreas);

  const { token, tokenHash } = createSetupToken();
  // Re-inviting an existing address refreshes their token and roles (never
  // wiping an already-set password); the conflict-update's WHERE makes
  // inviting a disabled user a no-op instead of quietly re-arming it. Crew
  // fields only overwrite when the caller actually supplied them (coalesce /
  // non-empty check), so a Song Club re-invite can't blank a crew title.
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

export async function setRoles(userId: number, roles: unknown): Promise<void> {
  const clean = sanitizeRoles(roles);
  await sql.begin(async (tx) => {
    await tx`delete from user_roles where user_id = ${userId}`;
    for (const role of clean) {
      await tx`insert into user_roles (user_id, role) values (${userId}, ${role})`;
    }
  });
}

// Crew members: everyone holding the 'crew' role, newest-invited last.
export async function listCrew(): Promise<ClubMember[]> {
  return sql<ClubMember[]>`
    select ${COLUMNS} from users
    where exists (select 1 from user_roles r where r.user_id = users.id and r.role = 'crew')
    order by name asc, id asc
  `;
}

// Updates a crew member's title and/or focus areas. `title: null` clears it;
// `focusAreas` fully replaces the set. Either field can be omitted to leave it
// as-is.
export async function updateCrewFields(
  id: number,
  input: { title?: string | null; focusAreas?: unknown }
): Promise<ClubMember | null> {
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
): Promise<{ member: ClubMember; token: string } | null> {
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
export async function getMemberBySetupToken(token: string): Promise<ClubMember | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await sql<ClubMember[]>`
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
): Promise<ClubMember | null> {
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
  status: ClubMemberStatus;
  roles: ClubRole[];
  session_epoch: number;
} | null> {
  const [row] = await sql<
    Array<{
      id: number;
      password_hash: string | null;
      status: ClubMemberStatus;
      roles: ClubRole[];
      session_epoch: number;
    }>
  >`
    select id, password_hash, status, session_epoch,
           (select coalesce(array_agg(r.role order by r.role), '{}')
              from user_roles r where r.user_id = users.id) as roles
    from users where email = ${normalizeEmail(email)}
  `;
  return row ?? null;
}

export async function setMemberStatus(
  id: number,
  status: 'active' | 'disabled'
): Promise<ClubMember | null> {
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

// Active users who (a) can access the portal and (b) have the given
// notification category turned on — the recipient list for a blast.
export type NotifyCategory = 'announcements' | 'events';

export async function getNotificationRecipients(
  category: NotifyCategory
): Promise<Array<{ id: number; email: string; name: string }>> {
  const column = category === 'announcements' ? 'notify_announcements' : 'notify_events';
  return sql<Array<{ id: number; email: string; name: string }>>`
    select u.id, u.email, u.name
    from users u
    join user_roles r on r.user_id = u.id and r.role = 'song_club'
    where u.status = 'active' and u.${sql(column)} = true
  `;
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
): Promise<ClubMember | null> {
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

// The logged-in user for the current request, from the session cookie.
// Re-loads the row so a disabled/deleted user — or a token from before the
// last password change (stale epoch) — is locked out immediately, signed
// cookie or not.
export async function getClubMember(): Promise<ClubMember | null> {
  const token = (await cookies()).get(CLUB_SESSION_COOKIE)?.value;
  const info = verifyClubSessionToken(token);
  if (info === null) return null;
  const member = await getMemberById(info.memberId);
  return member && member.status === 'active' && Number(member.session_epoch) === info.epoch
    ? member
    : null;
}

// The current user only if they can access the Song Club portal. A crew- or
// staff-only login has a valid session but no 'song_club' role, so it isn't
// admitted to /club.
export async function getClubPortalMember(): Promise<ClubMember | null> {
  const member = await getClubMember();
  return member?.roles.includes('song_club') ? member : null;
}

// Whoever is acting on the portal right now: a member, the admin session
// (Alex, acting as "the Birdhaus"), or nobody. The shape doubles as the
// `by` argument the club data layers take for ownership checks.
export type ClubActor = { memberId: number } | { admin: true };

export async function getClubActor(): Promise<ClubActor | null> {
  const member = await getClubMember();
  if (member) return { memberId: member.id };
  return (await isAdminSession()) ? { admin: true } : null;
}

// The current user only if they can access the Yellow Ostrich workspace:
// the 'band' role, or staff (who see everything).
export async function getBandMember(): Promise<ClubMember | null> {
  const member = await getClubMember();
  return member && (member.roles.includes('band') || member.roles.includes('staff'))
    ? member
    : null;
}

// Whoever is acting on the band workspace. Unlike ClubActor, staff members
// keep their memberId (so uploads and comments stay attributed to a person,
// not "the Birdhaus") and carry a `staff` flag for moderation rights.
// {admin: true} only means a cookie-only admin session with no member login.
export type BandActor = { memberId: number; staff: boolean } | { admin: true };

export async function getBandActor(): Promise<BandActor | null> {
  const member = await getBandMember();
  if (member) return { memberId: member.id, staff: member.roles.includes('staff') };
  return (await isAdminSession()) ? { admin: true } : null;
}
