import { NextResponse } from 'next/server';
import {
  getLoginRow,
  inviteMember,
  normalizeEmail,
  refreshSetupToken,
} from '@/lib/club-members';
import { sendClubSignupEmail, sendClubPasswordResetEmail } from '@/lib/club-email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Public self-signup: anyone can join Song Club (general tier). We always email
// a set-password link — that both confirms the address and is the way in, so
// there are no unverified/fake accounts. The response is identical whichever
// branch runs, so it doesn't reveal whether an email already has an account.
export async function POST(request: Request) {
  if (!(await checkRateLimit(`club-signup:${getClientIp(request)}`, 5, 15 * 60))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!email || !name) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  // Cap per-address sends so signup can't be used to spam someone's inbox.
  if (!(await checkRateLimit(`club-signup-email:${email}`, 3, 60 * 60))) {
    return NextResponse.json({ ok: true });
  }

  try {
    const existing = await getLoginRow(email);
    if (!existing) {
      // Brand-new account (song_club role by default).
      const result = await inviteMember({ email, name, roles: ['song_club'] });
      if (!('error' in result)) {
        await sendClubSignupEmail({ name: result.member.name, email, token: result.token });
      }
    } else if (existing.status === 'active') {
      // Already has an account — send a reset/login link instead of a new one.
      const refreshed = await refreshSetupToken(existing.id, 'reset');
      if (refreshed) {
        await sendClubPasswordResetEmail({ name: refreshed.member.name, email, token: refreshed.token });
      }
    } else if (existing.status === 'invited') {
      // Invited but never finished — re-send the setup link (refresh only, so
      // any roles an admin already assigned are preserved).
      const refreshed = await refreshSetupToken(existing.id, 'invite');
      if (refreshed) {
        await sendClubSignupEmail({ name: refreshed.member.name, email, token: refreshed.token });
      }
    }
    // disabled: send nothing.
  } catch (e) {
    console.error('[club] signup email failed', e);
  }

  return NextResponse.json({ ok: true });
}
