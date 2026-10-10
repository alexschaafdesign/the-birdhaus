// Client-safe role constants — no server-only imports (next/headers, sql), so
// client components can import ALL_ROLES / ClubRole without pulling the whole
// data layer into the browser bundle. lib/club-members.ts re-exports these.

export type ClubRole = 'song_club' | 'crew' | 'staff' | 'band';

export const ALL_ROLES: ClubRole[] = ['song_club', 'crew', 'staff', 'band'];

// Crew/staff accounts belong to the Birdhaus side: their invite and reset links
// go to the Birdhaus site's /invite page, not the Song Club portal, and they
// land in /admin. An account holding both kinds counts as Birdhaus.
export function isBirdhausAccount(roles: ClubRole[]): boolean {
  return roles.includes('crew') || roles.includes('staff');
}
