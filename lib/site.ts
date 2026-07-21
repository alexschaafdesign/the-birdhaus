// Canonical production origin, used for metadataBase, sitemap, robots, and
// absolute Open Graph URLs. Override with NEXT_PUBLIC_SITE_URL if the domain
// ever changes; falls back to the production domain otherwise.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thebirdhaus.org'
).replace(/\/$/, '');

export const SITE_NAME = 'the BIRDHAUS';
export const SITE_DESCRIPTION =
  'A DIY house venue and record label in Powderhorn, Minneapolis.';
