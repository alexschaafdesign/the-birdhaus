import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createOperatorSessionToken,
  sha256Hex,
  timingSafeEqual,
} from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  // Throttle password guesses per IP: 10 attempts per 15 minutes. The single
  // shared password has no other brute-force protection.
  const allowed = await checkRateLimit(`login:${getClientIp(request)}`, 10, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  // Compare digests, not the raw strings: constant-time and constant-length,
  // so neither the characters nor the length of the real password leak through
  // response timing.
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !timingSafeEqual(await sha256Hex(password), await sha256Hex(expected))) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const token = await createOperatorSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
