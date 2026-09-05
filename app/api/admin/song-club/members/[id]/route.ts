import { NextResponse } from 'next/server';
import {
  deleteMember,
  getMemberById,
  listMembers,
  refreshSetupToken,
  setMemberStatus,
  setRoles,
} from '@/lib/club-members';
import { sendClubInviteEmail, sendClubPasswordResetEmail } from '@/lib/club-email';
import { requireAdmin } from '@/lib/admin-session';

// Admin auth: enforced by proxy.ts for all /api/admin routes.

// PATCH { action: 'disable' | 'enable' | 'resend' }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === 'disable' || action === 'enable') {
    const member = await setMemberStatus(id, action === 'disable' ? 'disabled' : 'active');
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ members: await listMembers() });
  }

  if (action === 'roles') {
    const existing = await getMemberById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await setRoles(id, body?.roles);
    return NextResponse.json({ members: await listMembers() });
  }

  if (action === 'resend') {
    // For someone who never joined this re-sends the invite; for an active
    // member it doubles as an admin-initiated password reset.
    const existing = await getMemberById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const purpose = existing.status === 'active' ? 'reset' : 'invite';
    const refreshed = await refreshSetupToken(id, purpose);
    if (!refreshed) {
      return NextResponse.json({ error: 'Member is disabled' }, { status: 400 });
    }
    try {
      const send = purpose === 'reset' ? sendClubPasswordResetEmail : sendClubInviteEmail;
      await send({
        name: refreshed.member.name,
        email: refreshed.member.email,
        token: refreshed.token,
      });
    } catch (e) {
      console.error('[club] invite email failed', e);
      return NextResponse.json({ error: 'Invite email failed to send' }, { status: 502 });
    }
    return NextResponse.json({ members: await listMembers() });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (!(await deleteMember(id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ members: await listMembers() });
}
