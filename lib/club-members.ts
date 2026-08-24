// Song Club member accounts — data layer. Invite-only: the admin creates a
// member row (status 'invited') and emails a set-password link; accepting it
// activates the account. The same token machinery doubles as password reset.

import { cookies } from 'next/headers';
import { sql } from './db';
import {
  CLUB_SESSION_COOKIE,
  createSetupToken,
  hashPassword,
  hashSetupToken,
  verifyClubSessionToken,
} from './club-auth';

export type ClubMemberStatus = 'invited' | 'active' | 'disabled';

export interface ClubMember {
  id: number;
  email: string;
  name: string;
  status: ClubMemberStatus;
  has_password: boolean;
  invited_at: string;
  joined_at: string | null;
  last_seen_at: string | null;
}

const INVITE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // invites linger a month
const RESET_TOKEN_TTL_SECONDS = 60 * 60 * 2; // resets are short-lived

const COLUMNS = sql`
  id, email, name, status, (password_hash is not null) as has_password,
  invited_at::text as invited_at, joined_at::text as joined_at,
  last_seen_at::text as last_seen_at
`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listMembers(): Promise<ClubMember[]> {
  return sql<ClubMember[]>`
    select ${COLUMNS} from song_club_members order by name asc, id asc
  `;
}

export async function getMemberById(id: number): Promise<ClubMember | null> {
  const [row] = await sql<ClubMember[]>`
    select ${COLUMNS} from song_club_members where id = ${id}
  `;
  return row ?? null;
}

// Creates (or re-invites) a member and returns the raw setup token for the
// invite email.
export async function inviteMember(input: {
  email: string;
  name: string;
}): Promise<{ member: ClubMember; token: string } | { error: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !name) return { error: 'Name and email are required' };

  const { token, tokenHash } = createSetupToken();
  // Re-inviting an existing address refreshes their token (never wiping an
  // already-set password); the conflict-update's WHERE makes inviting a
  // disabled member a no-op (returns no row) instead of quietly re-arming it.
  const [row] = await sql<ClubMember[]>`
    insert into song_club_members (email, name, setup_token_hash, setup_token_expires_at)
    values (${email}, ${name}, ${tokenHash},
            now() + make_interval(secs => ${INVITE_TOKEN_TTL_SECONDS}))
    on conflict (email) do update set
      name = excluded.name,
      setup_token_hash = excluded.setup_token_hash,
      setup_token_expires_at = excluded.setup_token_expires_at,
      invited_at = now()
    where song_club_members.status <> 'disabled'
    returning ${COLUMNS}
  `;
  if (!row) return { error: 'That member is disabled — re-enable them first' };
  return { member: row, token };
}

// Refreshes the setup token for an existing (non-disabled) member — used by
// both "resend invite" and "forgot password". Returns null if no such member.
export async function refreshSetupToken(
  memberId: number,
  purpose: 'invite' | 'reset'
): Promise<{ member: ClubMember; token: string } | null> {
  const ttl = purpose === 'invite' ? INVITE_TOKEN_TTL_SECONDS : RESET_TOKEN_TTL_SECONDS;
  const { token, tokenHash } = createSetupToken();
  const [row] = await sql<ClubMember[]>`
    update song_club_members set
      setup_token_hash = ${tokenHash},
      setup_token_expires_at = now() + make_interval(secs => ${ttl})
    where id = ${memberId} and status <> 'disabled'
    returning ${COLUMNS}
  `;
  return row ? { member: row, token } : null;
}

// Resolves a raw setup token from an emailed link to its member. null =
// unknown, already used, or expired.
export async function getMemberBySetupToken(token: string): Promise<ClubMember | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await sql<ClubMember[]>`
    select ${COLUMNS} from song_club_members
    where setup_token_hash = ${hashSetupToken(token)}
      and setup_token_expires_at > now()
      and status <> 'disabled'
  `;
  return row ?? null;
}

// Consumes a setup token: sets the password, activates the account, clears the
// token (single-use). Returns the member, or null if the token was invalid.
export async function acceptSetupToken(
  token: string,
  password: string
): Promise<ClubMember | null> {
  const member = await getMemberBySetupToken(token);
  if (!member) return null;

  const passwordHash = await hashPassword(password);
  const [row] = await sql<ClubMember[]>`
    update song_club_members set
      password_hash = ${passwordHash},
      status = 'active',
      joined_at = coalesce(joined_at, now()),
      setup_token_hash = null,
      setup_token_expires_at = null
    where id = ${member.id} and setup_token_hash = ${hashSetupToken(token)}
    returning ${COLUMNS}
  `;
  return row ?? null;
}

// For login: the one query that needs the password hash.
export async function getLoginRow(
  email: string
): Promise<{ id: number; password_hash: string | null; status: ClubMemberStatus } | null> {
  const [row] = await sql<
    Array<{ id: number; password_hash: string | null; status: ClubMemberStatus }>
  >`
    select id, password_hash, status from song_club_members
    where email = ${normalizeEmail(email)}
  `;
  return row ?? null;
}

export async function setMemberStatus(
  id: number,
  status: 'active' | 'disabled'
): Promise<ClubMember | null> {
  // Enabling someone who never accepted their invite returns them to
  // 'invited' (they still have no password to log in with).
  const [row] = await sql<ClubMember[]>`
    update song_club_members set
      status = case
        when ${status} = 'active' and password_hash is null then 'invited'
        else ${status}
      end
    where id = ${id}
    returning ${COLUMNS}
  `;
  return row ?? null;
}

export async function deleteMember(id: number): Promise<boolean> {
  const result = await sql`delete from song_club_members where id = ${id}`;
  return result.count > 0;
}

export async function touchLastSeen(id: number): Promise<void> {
  await sql`update song_club_members set last_seen_at = now() where id = ${id}`;
}

// The logged-in member for the current request, from the session cookie.
// Re-loads the row so a disabled/deleted member is locked out immediately,
// signed cookie or not.
export async function getClubMember(): Promise<ClubMember | null> {
  const token = (await cookies()).get(CLUB_SESSION_COOKIE)?.value;
  const memberId = verifyClubSessionToken(token);
  if (memberId === null) return null;
  const member = await getMemberById(memberId);
  return member && member.status === 'active' ? member : null;
}
