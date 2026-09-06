import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { getVersionAudioRef } from '@/lib/band-songs';
import { createPrivateSignedGetUrl } from '@/lib/r2-private';

// Session-gated Yellow Ostrich version audio — same shape as
// /api/club/audio/[id], but admitted by the band workspace's actor (band role,
// staff, or the admin session). Un-migrated versions (r2_key null) fall back
// to their legacy public URL.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ref = await getVersionAudioRef(id);
  const target = ref ? (ref.r2Key ? await createPrivateSignedGetUrl(ref.r2Key) : ref.url) : null;
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
