import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE_URL, isPortalHost } from '@/lib/site';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // The portal host is members-only — keep crawlers out entirely (no sitemap).
  // isPortalHost is false until the domain split is switched on.
  if (isPortalHost((await headers()).get('host'))) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
