// The staging switch. next.thebirdhaus.org runs the future-2027 branch against a
// Neon branch copied from prod, so it holds real names and emails, real Square
// links and real Twin Scene band ids. Everything that leaves the app asks this
// file first.
//
// Fail-safe on purpose: outbound (email, payments, Mailchimp, Twin Scene writes,
// the contact form) is allowed ONLY on a production deploy that isn't staging.
// A preview deploy, local dev, or staging with BH_STAGING missing all come out
// "not allowed" — a forgotten env var blocks a send, it never permits one.
//
// Server-only: VERCEL_ENV and VERCEL_GIT_COMMIT_REF aren't exposed to the
// browser. Client components take the answer as a prop.

// The branch next.thebirdhaus.org deploys. Checked alongside BH_STAGING so the
// staging domain is still recognised if the flag is ever left off.
const STAGING_BRANCH = 'future-2027';
const STAGING_HOST_PREFIX = 'next.';

// True on the staging site. `host`, when a caller has the request, adds the
// domain check; the env checks cover the code paths that don't.
export function isStaging(host?: string | null): boolean {
  if (process.env.BH_STAGING === '1') return true;
  if (process.env.VERCEL_GIT_COMMIT_REF === STAGING_BRANCH) return true;
  if (host && host.toLowerCase().startsWith(STAGING_HOST_PREFIX)) return true;
  return false;
}

// True only where the app may talk to real people and real money: a production
// deploy that isn't staging. Everything else logs instead.
export function outboundAllowed(host?: string | null): boolean {
  return process.env.VERCEL_ENV === 'production' && !isStaging(host);
}

// The one address that may receive mail when outbound is blocked (staging,
// previews, local dev). Unset = log only, send nothing.
export function stagingEmailTo(): string | null {
  const to = process.env.BH_STAGING_EMAIL_TO?.trim();
  return to ? to : null;
}

// Log line for a blocked side effect. Counts and labels only — never addresses,
// bodies or payment details, since these land in Vercel's runtime logs.
export function logBlocked(kind: string, detail: Record<string, string | number | boolean | null> = {}): void {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  console.log(`[staging] blocked ${kind}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

// R2 filename tag. The bucket is shared with prod, so uploads from anywhere but
// a production deploy are named folder/staging-<time>-<hex>.ext: easy to list
// and delete, and never mistaken for prod's. A tag on the filename rather than a
// staging/ folder, so keys keep the folder/ shape readers check (the /tv image
// proxy only serves flyers/, bands/ and tv/).
export function uploadNameTag(): string {
  return outboundAllowed() ? '' : 'staging-';
}
