import type { NextResponse } from 'next/server';
import { CLUB_SESSION_COOKIE, CLUB_SESSION_MAX_AGE_SECONDS, createClubSessionToken } from './club-auth';
import { SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, createStaffSessionToken } from './auth';
import type { ClubRole } from './club-members';

// Staff accounts also get the admin session cookie, so proxy.ts admits them to
// /admin with zero middleware changes. Their token carries the user id and
// session epoch, so — unlike the shared-password operator cookie — disabling
// the account or bumping its epoch revokes an already-issued cookie on the
// next request (lib/admin-session.ts re-checks the row).

// Sets the club session cookie for a user, plus the admin cookie when they
// hold the 'staff' role. Shared by login, invite-accept, and password change
// (which bumps the epoch and needs to re-issue cookies for the changer).
export async function grantSessionCookies(
  response: NextResponse,
  userId: number,
  roles: ClubRole[],
  sessionEpoch: number
): Promise<void> {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(CLUB_SESSION_COOKIE, createClubSessionToken(userId, sessionEpoch), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: CLUB_SESSION_MAX_AGE_SECONDS,
  });
  if (roles.includes('staff')) {
    response.cookies.set(SESSION_COOKIE, await createStaffSessionToken(userId, sessionEpoch), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    });
  }
}
