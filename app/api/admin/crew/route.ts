import { NextResponse } from 'next/server';
import { inviteMember, listCrew } from '@/lib/club-members';
import { sendCrewInviteEmail } from '@/lib/club-email';

// Admin auth: enforced by proxy.ts for all /api/admin routes.

export async function GET() {
  return NextResponse.json({ crew: await listCrew() });
}

// Invite a crew member: a login with the 'crew' + 'staff' roles (staff grants
// full admin), plus their title and focus areas. Emails the set-password link.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  const title = typeof body?.title === 'string' ? body.title : null;
  const focusAreas = Array.isArray(body?.focusAreas) ? body.focusAreas : [];

  const result = await inviteMember({
    email,
    name,
    roles: ['crew', 'staff'],
    title,
    focusAreas,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await sendCrewInviteEmail({
      name: result.member.name,
      email: result.member.email,
      token: result.token,
      title: result.member.title,
    });
  } catch (e) {
    console.error('[crew] invite email failed', e);
    return NextResponse.json(
      { error: "Crew member saved, but the invite email failed to send. Try 'Resend invite'." },
      { status: 502 }
    );
  }

  return NextResponse.json({ crew: await listCrew() });
}
