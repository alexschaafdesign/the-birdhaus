import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { createVersion } from '@/lib/band-songs';
import { BAND_SONGS_FOLDER } from '@/lib/r2';

// Step 2 of a version upload: after the browser PUT the audio to R2 (see
// versions/upload-url), register it under the song. The client sends back the
// KEY, never a URL — the key must sit in the band folder with the
// server-generated shape, so nobody can register an off-site URL as a version.
const KEY_RE = new RegExp(`^${BAND_SONGS_FOLDER}/\\d+-[0-9a-f]{8}\\.[a-z0-9]{1,8}$`);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const songId = Number((await params).id);
  if (!Number.isInteger(songId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  const label = typeof body?.label === 'string' ? body.label : '';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : null;
  const peaks = Array.isArray(body?.peaks) ? (body.peaks as number[]) : null;
  const durationSeconds = typeof body?.durationSeconds === 'number' ? body.durationSeconds : null;

  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  const publicBase = process.env.R2_PUBLIC_URL_BASE;
  if (!publicBase) {
    return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
  }

  const version = await createVersion({
    actor,
    songId,
    label,
    url: `${publicBase.replace(/\/$/, '')}/${key}`,
    contentType,
    sizeBytes,
    peaks,
    durationSeconds,
  });
  if (!version) {
    return NextResponse.json({ error: 'A label is required' }, { status: 400 });
  }

  return NextResponse.json({ version });
}
