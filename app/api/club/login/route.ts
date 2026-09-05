import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/club-auth';
import { getLoginRow, touchLastSeen } from '@/lib/club-members';
import { grantSessionCookies } from '@/lib/club-session';
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
  // Where to send them next: Song Club members to the portal; band-only
  // logins to the Yellow Ostrich workspace; crew/staff-only to admin.
  const dest = row.roles.includes('song_club')
    ? '/song-club'
    : row.roles.includes('band')
      ? '/yellow-ostrich'
      : '/admin';
  const response = NextResponse.json({ ok: true, dest });
  await grantSessionCookies(response, row.id, row.roles, row.session_epoch);
  return response;
}
