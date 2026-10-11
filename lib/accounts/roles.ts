// Client-safe role constants: no server-only imports (next/headers, sql), so
// client components can import ALL_ROLES / AccountRole without pulling the
// data layer into the browser bundle. lib/accounts/members.ts re-exports these.
//
// Birdhaus accounts are crew and staff: crew = the crew pages (sound,
// photography, door); staff = the admin dashboard. The users table still
// holds song_club/band role rows from before the Songhaus split; Birdhaus
// ignores them (they go with Phase 5 Deploy C) and never writes them.

export type AccountRole = 'crew' | 'staff';

export const ALL_ROLES: AccountRole[] = ['crew', 'staff'];

export const ROLE_LABEL: Record<AccountRole, string> = {
  crew: 'Crew',
  staff: 'Staff (admin)',
};

// A Birdhaus login: holds crew or staff. An account with neither is a former
// Song Club member (or one whose access was removed): it can't sign in here.
export function isBirdhausAccount(roles: readonly string[]): boolean {
  return roles.includes('crew') || roles.includes('staff');
}
