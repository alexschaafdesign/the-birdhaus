import { NextResponse } from 'next/server';
import {
  CLUB_SESSION_COOKIE,
  CLUB_SESSION_MAX_AGE_SECONDS,
  createClubSessionToken,
  verifyPassword,
} from '@/lib/club-auth';
import { getLoginRow, touchLastSeen } from '@/lib/club-members';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// One deliberately vague error for every failure mode, so the form can't be
// used to probe which emails have accounts.
const FAILED = { error: 'Incorrect email or password' };

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`club-login:${getClientIp(request)}`, 10, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json(FAILED, { status: 401 });

  const row = await getLoginRow(email);
  if (!row || row.status !== 'active' || !row.password_hash) {
    return NextResponse.json(FAILED, { status: 401 });
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    return NextResponse.json(FAILED, { status: 401 });
  }

  await touchLastSeen(row.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLUB_SESSION_COOKIE, createClubSessionToken(row.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CLUB_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
