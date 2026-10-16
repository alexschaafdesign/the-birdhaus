import { NextResponse } from 'next/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/auth';
import { acceptSetupToken, getMemberBySetupToken, touchLastSeen } from '@/lib/accounts/members';
import { isBirdhausAccount } from '@/lib/accounts/roles';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { grantSessionCookies } from '@/lib/accounts/session';
import { SONGHAUS_URL } from '@/lib/site';

// Consumes a set-password link from a crew invite or a Birdhaus password reset
// (the /invite/<token> page): sets the password, activates the account, and
// logs them straight in. Only for crew/staff accounts: any other token (a
// leftover Song Club one) is refused before it's used, with a link to
// Songhaus, where those accounts live now.
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

  const { token } = await params;
  const holder = await getMemberBySetupToken(token);
  if (holder && !isBirdhausAccount(holder.roles)) {
    return NextResponse.json(
      { error: 'Song Club is now Songhaus, and your account moved with it.', movedTo: `${SONGHAUS_URL}/login` },
      { status: 403 }
    );
  }
  const member = await acceptSetupToken(token, password);
  if (!member) {
    return NextResponse.json(
      { error: 'This link is invalid or has expired. Ask for a new one.' },
      { status: 400 }
    );
  }

  await touchLastSeen(member.id);
  const response = NextResponse.json({ ok: true, dest: '/admin' });
  await grantSessionCookies(response, member.id, member.roles, member.session_epoch);
  return response;
}
