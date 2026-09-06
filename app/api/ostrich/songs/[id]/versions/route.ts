import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { createVersion } from '@/lib/band-songs';
import { BAND_SONGS_FOLDER } from '@/lib/r2';
import { headPrivateObject, verifyUploadGrant } from '@/lib/r2-private';

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
  const uploadToken = typeof body?.uploadToken === 'string' ? body.uploadToken : null;
  const label = typeof body?.label === 'string' ? body.label : '';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const peaks = Array.isArray(body?.peaks) ? (body.peaks as number[]) : null;
  const durationSeconds = typeof body?.durationSeconds === 'number' ? body.durationSeconds : null;

  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  // The grant from upload-url binds the key to the actor who requested the
  // presign; the head check makes the stored size the storage truth and
  // re-enforces the cap. (Mirrors the club track register route.)
  if (!verifyUploadGrant(uploadToken, key, 'admin' in actor ? 'admin' : actor.memberId)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }
  const head = await headPrivateObject(key);
  if (!head) {
    return NextResponse.json({ error: 'Upload not found — try again' }, { status: 400 });
  }
  if (head.sizeBytes > 250 * 1024 * 1024) {
    return NextResponse.json({ error: 'Uploads can be up to 250 MB.' }, { status: 400 });
  }

  const version = await createVersion({
    actor,
    songId,
    label,
    r2Key: key,
    contentType: head.contentType ?? contentType,
    sizeBytes: head.sizeBytes,
    peaks,
    durationSeconds,
  });
  if (!version) {
    return NextResponse.json({ error: 'A label is required' }, { status: 400 });
  }

  return NextResponse.json({ version });
}
