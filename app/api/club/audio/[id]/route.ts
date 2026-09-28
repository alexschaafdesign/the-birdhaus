import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getTrackAudioRef } from '@/lib/club-music';
import { createPrivateSignedGetUrl, getPrivateObjectStream } from '@/lib/r2-private';

// Session-gated track audio: members (song_club role) and the admin get a 302
// to a short-TTL presigned GET on the private bucket. The player's <audio>
// element points here; each request re-follows the redirect, so range/seek
// requests keep working for the full TTL. Tracks not yet migrated (r2_key
// null) fall back to their legacy public URL so nothing breaks mid-move.
//
// ?proxy=1 streams the bytes through this route instead of redirecting —
// the player's stall-recovery path: a wedged browser media loader (or a
// media-filtering extension) can hang <audio> loads while fetch() still
// works, and fetch can't follow the cross-origin redirect (CORS). Only used
// after the normal path fails, so the bandwidth cost stays incidental.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getClubPortalMember();
  if (!member && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ref = await getTrackAudioRef(id);
  if (!ref) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (ref.r2Key && new URL(request.url).searchParams.get('proxy') === '1') {
    const obj = await getPrivateObjectStream(ref.r2Key, request.headers.get('range'));
    if (!obj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' });
    if (obj.contentType) headers.set('Content-Type', obj.contentType);
    if (obj.contentLength != null) headers.set('Content-Length', String(obj.contentLength));
    if (obj.contentRange) headers.set('Content-Range', obj.contentRange);
    return new Response(obj.body, { status: obj.status, headers });
  }

  const target = ref.r2Key ? await createPrivateSignedGetUrl(ref.r2Key) : ref.url;
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
