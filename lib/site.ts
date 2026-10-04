// Canonical production origin, used for metadataBase, sitemap, robots, and
// absolute Open Graph URLs. Override with NEXT_PUBLIC_SITE_URL if the domain
// ever changes; falls back to the production domain otherwise. www is the
// primary host — Vercel 307s the bare domain to it, so links built from the
// bare origin would cost every visitor an extra hop.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.thebirdhaus.org'
).replace(/\/$/, '');

// Origin that serves the Song Club portal and /w/ workspaces. Same as SITE_URL
// today; set NEXT_PUBLIC_PORTAL_URL to a subdomain (e.g. freshcuts.thebirdhaus.org)
// when the portal moves to its own app. Links that point INTO Song Club or a
// workspace — invite/reset/announcement emails and post-login redirects — use
// this instead of SITE_URL, so flipping the env var repoints them all at once.
export const PORTAL_URL = (
  process.env.NEXT_PUBLIC_PORTAL_URL ?? SITE_URL
).replace(/\/$/, '');

// Destination for an in-app redirect into the portal/workspaces. While the
// portal shares this app's origin (PORTAL_URL === SITE_URL) it returns a
// relative path, so localhost and preview deploys keep navigating internally;
// once a distinct portal host is configured it returns the absolute portal URL.
export function portalRedirect(path: string): string {
  return PORTAL_URL === SITE_URL ? path : `${PORTAL_URL}${path}`;
}

// Domain split: the portal is the same app served on a second host. The host
// routing (next.config.ts redirects/rewrites), robots, and sitemap all key off
// PORTAL_SPLIT, so with NEXT_PUBLIC_PORTAL_URL unset — localhost, previews —
// nothing changes.
export const PORTAL_SPLIT = new URL(PORTAL_URL).host !== new URL(SITE_URL).host;

// For request-time checks against the Host header (which includes any port).
export function isPortalHost(host: string | null): boolean {
  return PORTAL_SPLIT && host === new URL(PORTAL_URL).host;
}

export const SITE_NAME = 'the BIRDHAUS';
export const SITE_DESCRIPTION =
  'A DIY house venue and record label in Powderhorn, Minneapolis.';
