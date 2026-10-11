import { NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/club-members';
import { sendPasswordReset } from '@/lib/password-reset';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Always answers ok (no account enumeration); the email only goes out when the
// address actually belongs to a non-disabled member. The portal's login form
// calls this one; Birdhaus's /login calls /api/account/forgot (same buckets).
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`club-forgot:${getClientIp(request)}`, 5, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!email) return NextResponse.json({ ok: true });

  // Cap sends per target address too, so one IP can't spam a member's inbox
  // and a rotating-IP attacker can't either.
  if (!(await checkRateLimit(`club-forgot-email:${email}`, 3, 60 * 60))) {
    return NextResponse.json({ ok: true });
  }

  await sendPasswordReset(email);

  return NextResponse.json({ ok: true });
}
