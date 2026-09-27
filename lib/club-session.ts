import type { NextResponse } from 'next/server';
import { CLUB_SESSION_COOKIE, CLUB_SESSION_MAX_AGE_SECONDS, createClubSessionToken } from './club-auth';
import { SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, createStaffSessionToken } from './auth';
import type { ClubRole } from './club-members';

// Staff accounts also get the admin session cookie, so proxy.ts admits them to
// /admin with zero middleware changes. Their token carries the user id and
// session epoch, so — unlike the shared-password operator cookie — disabling
// the account or bumping its epoch revokes an already-issued cookie on the
// next request (lib/admin-session.ts re-checks the row).

// Apex domain for session cookies in production, so a future portal subdomain
// (songclub.thebirdhaus.org) is sent the same session. undefined off production:
// localhost has no dot-domain, and a preview *.vercel.app deploy would REJECT a
// .thebirdhaus.org cookie. Gated on VERCEL_ENV, matching scripts/predeploy-migrate.mjs.
const APEX_COOKIE_DOMAIN = '.thebirdhaus.org';

function sessionCookieDomain(): string | undefined {
  return process.env.VERCEL_ENV === 'production' ? APEX_COOKIE_DOMAIN : undefined;
}

// Appends a raw Set-Cookie that expires `name` for `domain` (undefined = the
// host-only variant). This can't go through response.cookies: that store is
// keyed by cookie NAME, re-serializing the whole set-cookie header on every
// write — so two same-name cookies can't coexist there (a set + delete of one
// name collapses to a single header, and an earlier write is clobbered). Hence
// a direct append, which callers MUST do AFTER all response.cookies.* writes.
function appendExpiredCookie(response: NextResponse, name: string, domain?: string): void {
  const attrs = ['Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  if (domain) attrs.push(`Domain=${domain}`);
  response.headers.append('set-cookie', `${name}=; ${attrs.join('; ')}`);
}

// Sets the club session cookie for a user, plus the admin cookie when they hold
// the 'staff' role. Shared by login, invite-accept, and password change (which
// bumps the epoch and needs to re-issue cookies for the changer).
export async function grantSessionCookies(
  response: NextResponse,
  userId: number,
  roles: ClubRole[],
  sessionEpoch: number
): Promise<void> {
  const secure = process.env.NODE_ENV === 'production';
  const domain = sessionCookieDomain();
  const isStaff = roles.includes('staff');

  response.cookies.set(CLUB_SESSION_COOKIE, createClubSessionToken(userId, sessionEpoch), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    domain,
    maxAge: CLUB_SESSION_MAX_AGE_SECONDS,
  });
  const issued = [CLUB_SESSION_COOKIE];
  if (isStaff) {
    response.cookies.set(SESSION_COOKIE, await createStaffSessionToken(userId, sessionEpoch), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      domain,
      maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    });
    issued.push(SESSION_COOKIE);
  }

  // The cookies above are apex-scoped in production. A host-only cookie of the
  // same name left from before the widening would ALSO be sent on the apex host;
  // a Cookie header can then carry the name twice, and the server's read is
  // last-wins with browser-dependent ordering — so the stale host-only cookie
  // (e.g. a previous account's session outliving a re-login) could shadow the
  // one just set. Expire the host-only variant so only the fresh apex cookie
  // survives. MUST run last — every response.cookies.set above rebuilds the
  // whole set-cookie header (see appendExpiredCookie).
  if (domain) {
    for (const name of issued) appendExpiredCookie(response, name);
  }

  // A non-staff account gets no admin cookie — but a leftover admin cookie from
  // a previous staff session on this browser would still be sent and read as an
  // admin session (isAdminSession keys off it), and nothing above overwrites it.
  // Expire it so the new account can't inherit admin: the host-only variant in
  // any environment (nothing here replaces it, unlike the widening clears above),
  // plus the apex variant in production. Same headers.append, after all
  // response.cookies.* writes. Staff issuance is unchanged (it sets the cookie).
  if (!isStaff) {
    appendExpiredCookie(response, SESSION_COOKIE);
    if (domain) appendExpiredCookie(response, SESSION_COOKIE, domain);
  }
}

// Clears session cookies on logout: the host-only variant and, in production,
// the apex variant too, so a browser holding either — or, mid-migration, both —
// is fully signed out. Defaults to both session cookies; admin logout passes
// just the admin cookie.
export function clearSessionCookies(
  response: NextResponse,
  names: readonly string[] = [CLUB_SESSION_COOKIE, SESSION_COOKIE]
): void {
  const domain = sessionCookieDomain();
  for (const name of names) response.cookies.delete(name); // host-only variant
  if (domain) {
    for (const name of names) appendExpiredCookie(response, name, domain); // apex variant
  }
}
