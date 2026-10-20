// The staging switch. next.thebirdhaus.org runs the `staging` branch against a
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
const STAGING_BRANCH = 'staging';
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

type LogDetail = Record<string, string | number | boolean | null>;

// `[staging] <event>` log line for a side effect handled off production. Counts
// and labels only — never addresses, bodies or payment details, since these land
// in Vercel's runtime logs.
export function logStaging(event: string, detail: LogDetail = {}): void {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  console.log(`[staging] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

export function logBlocked(kind: string, detail: LogDetail = {}): void {
  logStaging(`blocked ${kind}`, detail);
}

// Square's hosted checkout. A stored link on one of these hosts is a live
// payment link on the real account — 18 older shows keep one in ticket_url, and
// show_square_links holds the per-tier ones.
const SQUARE_CHECKOUT_HOST = /(^|\.)(square\.link|square\.site|squareup\.com)$/i;
// The production site. Some stored ticket_urls are absolute links to it
// (https://thebirdhaus.org/shows/…/tickets); followed from staging they'd land
// on prod's tickets page, whose checkout is live.
const PRODUCTION_HOST = /^(www\.)?thebirdhaus\.org$/i;

export function isSquareCheckoutUrl(url: string): boolean {
  try {
    return SQUARE_CHECKOUT_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// A ticket URL that's safe to show here. On production it's returned as is.
// Anywhere else:
//   * a Square checkout link becomes this show's /checkout path, which answers
//     "checkout disabled" off production (app/shows/[id]/checkout), so a stored
//     square.link never reaches a page, the hub, an email or an admin link;
//   * an absolute link to the production site keeps its path but drops the
//     host, so it stays on this deploy instead of crossing to prod;
//   * anything else passes through.
// Rewritten URLs are relative: callers that need an absolute URL (emails)
// prefix SITE_URL.
export function guardTicketUrl(url: string, showParam: string): string;
export function guardTicketUrl(url: string | undefined, showParam: string): string | undefined;
export function guardTicketUrl(url: string | undefined, showParam: string): string | undefined {
  // No log line: this runs for every show a list page maps.
  if (!url || outboundAllowed()) return url;
  if (isSquareCheckoutUrl(url)) return `/shows/${encodeURIComponent(showParam)}/checkout`;
  try {
    const parsed = new URL(url);
    if (PRODUCTION_HOST.test(parsed.hostname)) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // relative or unparseable: leave it
  }
  return url;
}

// R2 filename tag. The bucket is shared with prod, so uploads from anywhere but
// a production deploy are named folder/staging-<time>-<hex>.ext: easy to list
// and delete, and never mistaken for prod's. A tag on the filename rather than a
// staging/ folder, so keys keep the folder/ shape readers check (the /tv image
// proxy only serves flyers/, bands/ and tv/).
export function uploadNameTag(): string {
  return outboundAllowed() ? '' : 'staging-';
}
