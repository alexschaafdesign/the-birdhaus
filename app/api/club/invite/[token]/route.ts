import { NextResponse } from 'next/server';
import {
  CLUB_SESSION_COOKIE,
  CLUB_SESSION_MAX_AGE_SECONDS,
  MIN_PASSWORD_LENGTH,
  createClubSessionToken,
} from '@/lib/club-auth';
import { acceptSetupToken, touchLastSeen } from '@/lib/club-members';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLUB_SESSION_COOKIE, createClubSessionToken(member.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CLUB_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
