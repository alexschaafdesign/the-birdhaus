import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { createPresignedUploadUrl, BAND_SONGS_FOLDER } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Audio only. Some browsers report no MIME type for audio files, so the
// extension is the fallback source of truth. (Mirrors the Song Club
// track-upload route.)
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

const MAX_VERSION_BYTES = 250 * 1024 * 1024; // plenty for a WAV, still a sanity cap

// Step 1 of a version upload: hand the browser a short-lived presigned PUT URL
// so the audio goes straight to R2. Step 2 (POST /api/ostrich/songs/[id]/versions)
// registers the uploaded key as a version.
export async function POST(request: Request) {
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await checkRateLimit(`band-upload:${getClientIp(request)}`, 20, 60 * 60);
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
  if (!sizeBytes || sizeBytes > MAX_VERSION_BYTES) {
    return NextResponse.json({ error: 'Uploads can be up to 250 MB.' }, { status: 400 });
  }

  const { key, uploadUrl } = await createPresignedUploadUrl(
    BAND_SONGS_FOLDER,
    contentType,
    filename
  );
  return NextResponse.json({ key, uploadUrl, contentType });
}
