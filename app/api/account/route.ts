import { NextResponse } from 'next/server';
import { getSessionAccount, updateProfile, changePassword } from '@/lib/accounts/members';
import { grantSessionCookies } from '@/lib/accounts/session';

// Self-service account settings (/account) for the logged-in crew/staff
// account.

// PATCH { name?, bio?, notifyTrackComments?, notifyAnnouncements?, notifyEvents? }
export async function PATCH(request: Request) {
  const member = await getSessionAccount();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const updated = await updateProfile(member.id, {
    name: typeof body?.name === 'string' ? body.name : undefined,
    bio: typeof body?.bio === 'string' ? body.bio : undefined,
    links: body?.links !== undefined ? body.links : undefined,
    notifyTrackComments:
      typeof body?.notifyTrackComments === 'boolean' ? body.notifyTrackComments : undefined,
    notifyAnnouncements:
      typeof body?.notifyAnnouncements === 'boolean' ? body.notifyAnnouncements : undefined,
    notifyEvents: typeof body?.notifyEvents === 'boolean' ? body.notifyEvents : undefined,
  });
  if (!updated) return NextResponse.json({ error: 'Update failed' }, { status: 400 });
  return NextResponse.json({ member: updated });
}

// POST { currentPassword, newPassword } — password change.
export async function POST(request: Request) {
  const member = await getSessionAccount();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters' },
      { status: 400 }
    );
  }
  const newEpoch = await changePassword(member.id, currentPassword, newPassword);
  if (newEpoch === null) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }
  // The epoch bump just logged out every session, including this one — re-issue
  // this device's cookies so the changer stays signed in; everywhere else stays
  // logged out.
  const response = NextResponse.json({ ok: true });
  await grantSessionCookies(response, member.id, member.roles, newEpoch);
  return response;
}
