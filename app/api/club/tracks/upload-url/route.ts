import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { createPresignedUploadUrl, SONG_CLUB_TRACKS_FOLDER } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Audio only. Some browsers report no MIME type for audio files, so the
// extension is the fallback source of truth.
const TYPE_FOR_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
};

const MAX_TRACK_BYTES = 250 * 1024 * 1024; // plenty for a WAV, still a sanity cap

// Step 1 of a track upload: hand the browser a short-lived presigned PUT URL
// so the audio goes straight to R2 (Vercel's request-body cap never applies).
// Step 2 (POST /api/club/tracks) registers the uploaded key as a track.
export async function POST(request: Request) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await checkRateLimit(`club-upload:${getClientIp(request)}`, 20, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many uploads at once — wait a bit.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const filename = typeof body?.filename === 'string' ? body.filename : '';
  const declaredType = typeof body?.contentType === 'string' ? body.contentType : '';
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : 0;

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = declaredType.startsWith('audio/')
    ? declaredType
    : TYPE_FOR_EXTENSION[extension];
  if (!contentType) {
    return NextResponse.json(
      { error: 'That doesn’t look like an audio file (mp3, m4a, wav, aiff, flac, ogg).' },
      { status: 400 }
    );
  }
  if (!sizeBytes || sizeBytes > MAX_TRACK_BYTES) {
    return NextResponse.json({ error: 'Tracks can be up to 250 MB.' }, { status: 400 });
  }

  const { key, uploadUrl } = await createPresignedUploadUrl(
    SONG_CLUB_TRACKS_FOLDER,
    contentType,
    filename
  );
  return NextResponse.json({ key, uploadUrl, contentType });
}
