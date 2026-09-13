import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { createTrack, getPlaylist, getRoundEvent } from '@/lib/club-music';
import { isEventAttendee } from '@/lib/club-events';
import { SONG_CLUB_TRACKS_FOLDER } from '@/lib/r2';
import { headPrivateObject, verifyUploadGrant } from '@/lib/r2-private';

// Step 2 of a track upload: after the browser PUT the audio to R2 (see
// upload-url), register it as a track. The client sends back the KEY, never a
// URL — the key must sit in the tracks folder with the server-generated
// shape, so nobody can register an off-site (or non-track) URL as a track.
const KEY_RE = new RegExp(`^${SONG_CLUB_TRACKS_FOLDER}/\\d+-[0-9a-f]{8}\\.[a-z0-9]{1,8}$`);

export async function POST(request: Request) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  const uploadToken = typeof body?.uploadToken === 'string' ? body.uploadToken : null;
  const title = typeof body?.title === 'string' ? body.title : '';
  const notes = typeof body?.notes === 'string' ? body.notes : null;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const playlistIdNum = Number(body?.playlistId);
  const playlistId = Number.isInteger(playlistIdNum) && playlistIdNum > 0 ? playlistIdNum : null;
  const dayRaw = typeof body?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
    ? body.day
    : null;
  const peaks = Array.isArray(body?.peaks) ? (body.peaks as number[]) : null;
  const durationSeconds = typeof body?.durationSeconds === 'number' ? body.durationSeconds : null;

  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  // The grant from upload-url binds the key to the actor who requested the
  // presign — nobody can register someone else's (or a guessed) key.
  if (!verifyUploadGrant(uploadToken, key, 'admin' in actor ? 'admin' : actor.memberId)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  // The object must actually exist in the private bucket, and its REAL size
  // (not a client claim) becomes the stored size — also re-enforces the cap.
  const head = await headPrivateObject(key);
  if (!head) {
    return NextResponse.json({ error: 'Upload not found — try again' }, { status: 400 });
  }
  if (head.sizeBytes > 250 * 1024 * 1024) {
    return NextResponse.json({ error: 'Tracks can be up to 250 MB.' }, { status: 400 });
  }

  // A locked round accepts no uploads until the admin opens it (admin exempt).
  if (playlistId && !('admin' in actor)) {
    const pl = await getPlaylist(playlistId);
    if (pl?.locked) {
      return NextResponse.json(
        { error: 'This round is locked — uploads open when it starts.' },
        { status: 403 }
      );
    }
  }

  // Event rounds: only that event's attendees upload into them (admin exempt),
  // and the chosen day must fall in the event's date range. Both re-derived
  // server-side — the client's word is never enough. Any attendee can file to
  // any in-range day: posting at 12:30am for "yesterday" is expected.
  let day: string | null = null;
  if (playlistId) {
    const roundEvent = await getRoundEvent(playlistId);
    if (roundEvent) {
      if (!('admin' in actor) && !(await isEventAttendee(roundEvent.id, actor.memberId))) {
        return NextResponse.json(
          { error: 'Join this event to upload into its round.' },
          { status: 403 }
        );
      }
      if (dayRaw) {
        const first = roundEvent.eventDate;
        const last = roundEvent.endDate ?? roundEvent.eventDate;
        // YYYY-MM-DD compares lexicographically — no Date parsing needed.
        if (dayRaw < first || dayRaw > last) {
          return NextResponse.json(
            { error: 'That day is outside this event.' },
            { status: 400 }
          );
        }
        day = dayRaw;
      }
    }
  }

  const track = await createTrack({
    actor,
    title,
    notes,
    r2Key: key,
    contentType: head.contentType ?? contentType,
    sizeBytes: head.sizeBytes,
    playlistId,
    day,
    peaks,
    durationSeconds,
  });
  if (!track) return NextResponse.json({ error: 'A title is required' }, { status: 400 });

  return NextResponse.json({ track });
}
