import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { SONG_CLUB_TRACKS_FOLDER } from '@/lib/r2';
import { createPrivatePresignedUploadUrl, createUploadGrant } from '@/lib/r2-private';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Audio only, and only formats EVERY member's browser can play back:
// aiff won't play in Chrome/Firefox, ogg/opus won't play on iPhones — an
// upload in those formats looks fine to the uploader and is a dead track
// for half the club. Some browsers report no MIME type for audio files, so
// the extension is the source of truth.
const TYPE_FOR_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

// Declared MIME variants browsers actually send for the allowed extensions.
const ALLOWED_DECLARED_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
]);

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
  const extensionType = TYPE_FOR_EXTENSION[extension];
  // The extension gates the allowlist; the declared type is kept when it's a
  // known variant (it's what playback serves as Content-Type).
  const contentType =
    extensionType && ALLOWED_DECLARED_TYPES.has(declaredType) ? declaredType : extensionType;
  if (!contentType) {
    return NextResponse.json(
      {
        error:
          'Upload an mp3, m4a, wav, or flac — other formats (aiff, ogg) don’t play in every member’s browser.',
      },
      { status: 400 }
    );
  }
  if (!sizeBytes || sizeBytes > MAX_TRACK_BYTES) {
    return NextResponse.json({ error: 'Tracks can be up to 250 MB.' }, { status: 400 });
  }

  // Private bucket, size signed into the PUT (a different Content-Length
  // fails the signature). The grant binds this key to this actor — register
  // (POST /api/club/tracks) refuses the key without it.
  const { key, uploadUrl } = await createPrivatePresignedUploadUrl(
    SONG_CLUB_TRACKS_FOLDER,
    contentType,
    sizeBytes,
    filename
  );
  const uploadToken = createUploadGrant(key, 'admin' in actor ? 'admin' : actor.memberId);
  return NextResponse.json({ key, uploadUrl, contentType, uploadToken });
}
