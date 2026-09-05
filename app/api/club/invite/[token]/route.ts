import { NextResponse } from 'next/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/club-auth';
import { acceptSetupToken, touchLastSeen } from '@/lib/club-members';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { grantSessionCookies } from '@/lib/club-session';

// Consumes an emailed set-password link (invite or reset): sets the password,
// activates the account, and logs the member straight in.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const allowed = await checkRateLimit(`club-invite:${getClientIp(request)}`, 10, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const member = await acceptSetupToken((await params).token, password);
  if (!member) {
    return NextResponse.json(
      { error: 'This link is invalid or has expired. Ask for a new one.' },
      { status: 400 }
    );
  }

  await touchLastSeen(member.id);
  // A crew/staff-only account (no song_club role) heads to /admin after setting
  // a password; Song Club members go to the portal. The form prefers this over
  // any `next` for a non-portal account.
  const dest = member.roles.includes('song_club') ? '/song-club' : '/admin';
  const response = NextResponse.json({ ok: true, dest });
  await grantSessionCookies(response, member.id, member.roles, member.session_epoch);
  return response;
}
