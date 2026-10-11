import { NextResponse } from 'next/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/club-auth';
import { acceptSetupToken, touchLastSeen } from '@/lib/club-members';
import { isBirdhausAccount } from '@/lib/club-roles';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { grantSessionCookies } from '@/lib/club-session';
import { portalRedirect } from '@/lib/site';

// Consumes a set-password link from a crew invite or a Birdhaus password reset
// (the /invite/<token> page): sets the password, activates the account, and
// logs them straight in. Same tokens as /api/club/invite; this is the Birdhaus
// side's own door so crew links never depend on the portal.
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
  // Crew/staff land in /admin. A portal-only account that somehow followed a
  // Birdhaus link still ends up in the portal rather than a 401.
  const dest = isBirdhausAccount(member.roles) ? '/admin' : portalRedirect('/song-club');
  const response = NextResponse.json({ ok: true, dest });
  await grantSessionCookies(response, member.id, member.roles, member.session_epoch);
  return response;
}
