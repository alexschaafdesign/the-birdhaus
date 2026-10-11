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

export const SITE_NAME = 'the BIRDHAUS';

export const SITE_DESCRIPTION =
  'A DIY house venue and record label in Powderhorn, Minneapolis.';
