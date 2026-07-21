import type { MetadataRoute } from 'next';
import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBands } from '@/lib/bands';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/archive', '/bands', '/videos', '/upcoming', '/contact'];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const today = getTodayCentral();
  const [shows, bands] = await Promise.all([getAllShows(), getAllBands()]);

  // Only public show pages: past shows (already happened) and announced upcoming.
  const showEntries: MetadataRoute.Sitemap = shows
    .filter((show) => show.date < today || show.announced)
    .map((show) => ({
      url: `${SITE_URL}/shows/${show.slug}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));

  const bandEntries: MetadataRoute.Sitemap = bands.map((band) => ({
    url: `${SITE_URL}/bands/${band.slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticEntries, ...showEntries, ...bandEntries];
}
