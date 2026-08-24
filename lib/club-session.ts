import type { NextResponse } from 'next/server';
import { CLUB_SESSION_COOKIE, CLUB_SESSION_MAX_AGE_SECONDS, createClubSessionToken } from './club-auth';
import { SESSION_COOKIE, createSessionToken } from './auth';
import type { ClubRole } from './club-members';

// Staff accounts also get the admin session cookie, so proxy.ts admits them to
// /admin with zero middleware changes. Shorter-lived than the club cookie:
// disabling a staff account stops new logins immediately, and any already-
// issued admin cookie ages out within a week.
export const STAFF_ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// Sets the club session cookie for a user, plus the admin cookie when they
// hold the 'staff' role. Shared by login and invite-accept.
export async function grantSessionCookies(
  response: NextResponse,
  userId: number,
  roles: ClubRole[]
): Promise<void> {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(CLUB_SESSION_COOKIE, createClubSessionToken(userId), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: CLUB_SESSION_MAX_AGE_SECONDS,
  });
  if (roles.includes('staff')) {
    response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: STAFF_ADMIN_COOKIE_MAX_AGE_SECONDS,
    });
  }
}
