import { NextResponse } from 'next/server';
import {
  deleteMember,
  getMemberById,
  listCrew,
  refreshSetupToken,
  setMemberStatus,
  updateCrewFields,
} from '@/lib/club-members';
import { sendCrewInviteEmail } from '@/lib/club-email';
import { requireAdmin } from '@/lib/admin-session';

// Admin auth: enforced by proxy.ts for all /api/admin routes.

// PATCH { action: 'profile' | 'disable' | 'enable' | 'resend', ... }
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

  if (action === 'profile') {
    const existing = await getMemberById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await updateCrewFields(id, { title: body?.title ?? null, focusAreas: body?.focusAreas });
    return NextResponse.json({ crew: await listCrew() });
  }

  if (action === 'disable' || action === 'enable') {
    const member = await setMemberStatus(id, action === 'disable' ? 'disabled' : 'active');
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ crew: await listCrew() });
  }

  if (action === 'resend') {
    // Re-sends the invite for someone who never joined; doubles as an admin-
    // initiated password reset for an active member. Crew get the crew-worded
    // email either way (it just says "pick a password to get in").
    const existing = await getMemberById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const purpose = existing.status === 'active' ? 'reset' : 'invite';
    const refreshed = await refreshSetupToken(id, purpose);
    if (!refreshed) {
      return NextResponse.json({ error: 'Crew member is disabled' }, { status: 400 });
    }
    try {
      await sendCrewInviteEmail({
        name: refreshed.member.name,
        email: refreshed.member.email,
        token: refreshed.token,
        title: refreshed.member.title,
      });
    } catch (e) {
      console.error('[crew] invite email failed', e);
      return NextResponse.json({ error: 'Invite email failed to send' }, { status: 502 });
    }
    return NextResponse.json({ crew: await listCrew() });
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
  return NextResponse.json({ crew: await listCrew() });
}
