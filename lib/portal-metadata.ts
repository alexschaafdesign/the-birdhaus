import type { Metadata } from 'next';
import { PORTAL_URL, SITE_NAME, SITE_DESCRIPTION } from './site';

// Segment metadata for portal routes (Song Club, /w): resolve relative URLs
// against the portal origin and stop og:url pointing at the main-site
// homepage. Identical to the root metadata until the domain split is on.
export function portalMetadata(url: string): Metadata {
  return {
    metadataBase: new URL(PORTAL_URL),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      url,
    },
  };
}
