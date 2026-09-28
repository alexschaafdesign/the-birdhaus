import { NextResponse } from 'next/server';
import { actorForVersion } from '@/lib/workspaces';
import { getVersionAudioRef } from '@/lib/band-songs';
import { createPrivateSignedGetUrl } from '@/lib/r2-private';

// Session-gated workspace version audio — same shape as /api/club/audio/[id],
// but admitted per-workspace: only members of the version's own workspace
// (or staff/admin) get the 302. Un-migrated versions (r2_key null) fall back
// to their legacy public URL.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const scoped = await actorForVersion(id);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ref = await getVersionAudioRef(id);
  const target = ref ? (ref.r2Key ? await createPrivateSignedGetUrl(ref.r2Key) : ref.url) : null;
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
