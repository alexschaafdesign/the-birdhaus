// Canonical production origin, used for metadataBase, sitemap, robots, and
// absolute Open Graph URLs. Override with NEXT_PUBLIC_SITE_URL if the domain
// ever changes; falls back to the production domain otherwise. www is the
// primary host — Vercel 307s the bare domain to it, so links built from the
// bare origin would cost every visitor an extra hop.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.thebirdhaus.org'
).replace(/\/$/, '');

// Songhaus, the songwriting app that Song Club became (its own repo and
// domain since the phase 3 cutover). Birdhaus only links there; next.config
// 308s the old portal paths to the same path on this origin.
export const SONGHAUS_URL = 'https://www.thesonghaus.org';
export const SONGHAUS_NAME = 'Songhaus';

// Where the Song Club portal and /w/ workspaces live: Songhaus. Links that
// point INTO them (invite/reset/notification emails, post-login redirects)
// use this, on every environment. The old portal host
// (freshcuts.thebirdhaus.org, via NEXT_PUBLIC_PORTAL_URL) is retired.
export const PORTAL_URL = SONGHAUS_URL;

// Destination for a redirect into the portal/workspaces: always the absolute
// Songhaus URL, since Birdhaus no longer serves those pages.
export function portalRedirect(path: string): string {
  return `${PORTAL_URL}${path}`;
}

// The portal is a separate app on its own host. Kept for the portal-era copy
// and pages that read it, until phase 5 deletes them.
export const PORTAL_SPLIT = true;

// Birdhaus serves no portal host any more, so no request is on one. Callers
// (the root layout, /login, /account, robots, sitemap) always get Birdhaus.
export function isPortalHost(host: string | null): boolean {
  void host;
  return false;
}

export const SITE_NAME = 'the BIRDHAUS';

// The portal's own identity on its host (titles, link previews, manifest).
export const PORTAL_SITE_NAME = 'Song Club';
export const PORTAL_DESCRIPTION = 'Song Club — songs, events, and the group thread.';

// The portal's name in visible copy (pages, member emails): "Song Club" on
// both hosts. The heading and place forms drop the "portal" wording once the
// split is on, since the portal host is then Song Club itself.
export const PORTAL_NAME = PORTAL_SITE_NAME;
export const PORTAL_HEADING = PORTAL_SPLIT ? PORTAL_SITE_NAME : 'Song Club portal';
export const PORTAL_PLACE = PORTAL_SPLIT ? PORTAL_SITE_NAME : 'the Song Club portal';

// Page titles that read "Song Club — <detail>" before the split; after it the
// root template already appends "· Song Club", so just the detail.
export function portalPageTitle(detail: string): string {
  return PORTAL_SPLIT ? detail.charAt(0).toUpperCase() + detail.slice(1) : `Song Club — ${detail}`;
}
export const SITE_DESCRIPTION =
  'A DIY house venue and record label in Powderhorn, Minneapolis.';
