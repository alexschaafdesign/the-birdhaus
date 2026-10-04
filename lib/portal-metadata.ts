import type { Metadata } from 'next';
import {
  PORTAL_URL,
  PORTAL_SPLIT,
  SITE_NAME,
  SITE_DESCRIPTION,
  PORTAL_SITE_NAME,
  PORTAL_DESCRIPTION,
} from './site';

// Segment metadata for portal routes (Song Club, /w): resolve relative URLs
// against the portal origin and stop og:url pointing at the main-site
// homepage. These segments only render on the portal host once the split is
// on, so PORTAL_SPLIT picks the identity; before that it's the root's.
export function portalMetadata(url: string): Metadata {
  const name = PORTAL_SPLIT ? PORTAL_SITE_NAME : SITE_NAME;
  const description = PORTAL_SPLIT ? PORTAL_DESCRIPTION : SITE_DESCRIPTION;
  return {
    metadataBase: new URL(PORTAL_URL),
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description,
      url,
    },
  };
}
