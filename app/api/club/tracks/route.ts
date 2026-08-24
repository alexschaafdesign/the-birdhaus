import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { createTrack } from '@/lib/club-music';
import { SONG_CLUB_TRACKS_FOLDER } from '@/lib/r2';

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
  const title = typeof body?.title === 'string' ? body.title : '';
  const notes = typeof body?.notes === 'string' ? body.notes : null;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : null;
  const playlistId =
    typeof body?.playlistId === 'number' && Number.isInteger(body.playlistId)
      ? body.playlistId
      : null;
  const peaks = Array.isArray(body?.peaks) ? (body.peaks as number[]) : null;
  const durationSeconds = typeof body?.durationSeconds === 'number' ? body.durationSeconds : null;

  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  const publicBase = process.env.R2_PUBLIC_URL_BASE;
  if (!publicBase) {
    return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
  }

  const track = await createTrack({
    actor,
    title,
    notes,
    url: `${publicBase.replace(/\/$/, '')}/${key}`,
    contentType,
    sizeBytes,
    playlistId,
    peaks,
    durationSeconds,
  });
  if (!track) return NextResponse.json({ error: 'A title is required' }, { status: 400 });

  return NextResponse.json({ track });
}
