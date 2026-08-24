import { NextResponse } from 'next/server';
import { inviteMember, listMembers } from '@/lib/club-members';
import { sendClubInviteEmail } from '@/lib/club-email';

// Admin auth: enforced by proxy.ts for all /api/admin routes.

export async function GET() {
  return NextResponse.json({ members: await listMembers() });
}

// Invite a member to the Song Club portal: create (or re-key) their row and
// email them the set-password link.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const name = typeof body?.name === 'string' ? body.name : '';

  const result = await inviteMember({ email, name });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await sendClubInviteEmail({
      name: result.member.name,
      email: result.member.email,
      token: result.token,
    });
  } catch (e) {
    console.error('[club] invite email failed', e);
    return NextResponse.json(
      { error: "Member saved, but the invite email failed to send. Try 'Resend invite'." },
      { status: 502 }
    );
  }

  return NextResponse.json({ members: await listMembers() });
}
