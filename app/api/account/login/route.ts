import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/accounts/auth';
import { getLoginRow, touchLastSeen } from '@/lib/accounts/members';
import { grantSessionCookies } from '@/lib/accounts/session';
import { SONGHAUS_URL } from '@/lib/site';
import { isBirdhausAccount } from '@/lib/accounts/roles';
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

  // Right password, but no crew/staff role: a former Song Club member (their
  // account lives on Songhaus now). No session here; point them there. Only
  // said after the password checks out, so it reveals nothing to a guesser.
  if (!isBirdhausAccount(row.roles)) {
    return NextResponse.json(
      { error: 'Song Club is now Songhaus, and your account moved with it.', movedTo: `${SONGHAUS_URL}/login` },
      { status: 403 }
    );
  }

  await touchLastSeen(row.id);
  const response = NextResponse.json({ ok: true, dest: '/admin' });
  await grantSessionCookies(response, row.id, row.roles, row.session_epoch);
  return response;
}
