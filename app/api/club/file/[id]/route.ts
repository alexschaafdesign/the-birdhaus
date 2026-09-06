import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPinFileRef } from '@/lib/club-board';
import { createPrivateSignedGetUrl } from '@/lib/r2-private';

// Session-gated pin-file downloads (kind='file' pins only — embeds/links are
// external and never pass through here). Same access rule as track audio.
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
  const ref = await getPinFileRef(id);
  const target = ref ? (ref.r2Key ? await createPrivateSignedGetUrl(ref.r2Key) : ref.url) : null;
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
