import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { isStaging, outboundAllowed } from '@/lib/staging';

export default function robots(): MetadataRoute.Robots {
  // Staging (and any other non-production deploy) is never indexed. next.config
  // also sends X-Robots-Tag: noindex on every response there.
  if (isStaging() || !outboundAllowed()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private rehearsal links (also noindex on the pages themselves).
      disallow: ['/admin', '/api', '/rehearsal/book/', '/rehearsal/review/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
