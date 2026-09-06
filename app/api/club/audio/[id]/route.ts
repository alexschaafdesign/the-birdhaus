import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getTrackAudioRef } from '@/lib/club-music';
import { createPrivateSignedGetUrl } from '@/lib/r2-private';

// Session-gated track audio: members (song_club role) and the admin get a 302
// to a short-TTL presigned GET on the private bucket. The player's <audio>
// element points here; each request re-follows the redirect, so range/seek
// requests keep working for the full TTL. Tracks not yet migrated (r2_key
// null) fall back to their legacy public URL so nothing breaks mid-move.
export async function GET(
  _request: Request,
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
  const target = ref ? (ref.r2Key ? await createPrivateSignedGetUrl(ref.r2Key) : ref.url) : null;
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
