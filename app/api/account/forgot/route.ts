import { NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/club-members';
import { sendPasswordReset } from '@/lib/password-reset';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Birdhaus's own forgot-password endpoint (the /login form on the main site).
// Always answers ok (no account enumeration). Shares its rate-limit buckets
// with /api/club/forgot, so alternating the two doesn't double the allowance.
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

  if (!(await checkRateLimit(`club-forgot-email:${email}`, 3, 60 * 60))) {
    return NextResponse.json({ ok: true });
  }

  await sendPasswordReset(email);

  return NextResponse.json({ ok: true });
}
