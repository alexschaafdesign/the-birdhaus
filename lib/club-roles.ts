// Client-safe role constants — no server-only imports (next/headers, sql), so
// client components can import ALL_ROLES / ClubRole without pulling the whole
// data layer into the browser bundle. lib/club-members.ts re-exports these.

export type ClubRole = 'song_club' | 'crew' | 'staff' | 'band';

export const ALL_ROLES: ClubRole[] = ['song_club', 'crew', 'staff', 'band'];
