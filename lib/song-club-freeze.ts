// Song Club's admin moved to Songhaus (extraction plan, phase 2). Birdhaus's
// /admin/song-club pages stay up read-only as a fallback until phase 5: no
// saves, no sends. Two admins writing the same rows would lose edits.
// Rollback = set this to false. Client-safe (the forms read it too).
export const SONG_CLUB_ADMIN_FROZEN = true;

export const SONGHAUS_ADMIN_URL = 'https://www.thesonghaus.org/admin';

export const SONG_CLUB_FROZEN_MESSAGE =
  'Song Club admin has moved to Songhaus. This copy is read-only.';

// The matching Songhaus admin page for a Birdhaus /admin/song-club path.
// Event ids are the same rows (shared database), so deep links carry over.
export function songhausAdminUrlFor(pathname: string): string {
  const m = pathname.match(/^\/admin\/song-club(?:\/(.*))?$/);
  const rest = m?.[1] ?? '';
  if (rest === 'members') return `${SONGHAUS_ADMIN_URL}/members`;
  if (rest === 'new') return `${SONGHAUS_ADMIN_URL}/events/new`;
  const event = rest.match(/^(\d+)\/(edit|rsvps)$/);
  if (event) {
    return `${SONGHAUS_ADMIN_URL}/events/${event[1]}/${event[2] === 'edit' ? 'edit' : 'people'}`;
  }
  return SONGHAUS_ADMIN_URL;
}

// For the Song Club admin API's write handlers, after the auth check: the 423
// to return while frozen, or null to proceed.
export function songClubAdminFrozenResponse(): Response | null {
  if (!SONG_CLUB_ADMIN_FROZEN) return null;
  return Response.json({ success: false, error: SONG_CLUB_FROZEN_MESSAGE }, { status: 423 });
}
