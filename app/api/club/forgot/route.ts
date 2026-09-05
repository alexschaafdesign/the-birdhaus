import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { normalizeEmail, refreshSetupToken } from '@/lib/club-members';
import { sendClubPasswordResetEmail } from '@/lib/club-email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Always answers ok (no account enumeration); the email only goes out when the
// address actually belongs to a non-disabled member.
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

  const [member] = await sql<Array<{ id: number; name: string }>>`
    select id, name from users
    where email = ${email} and status <> 'disabled'
  `;
  if (member) {
    const refreshed = await refreshSetupToken(Number(member.id), 'reset');
    if (refreshed) {
      try {
        await sendClubPasswordResetEmail({ name: member.name, email, token: refreshed.token });
      } catch (e) {
        console.error('[club] password reset email failed', e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
