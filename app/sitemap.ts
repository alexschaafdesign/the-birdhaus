import type { MetadataRoute } from 'next';
import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBands } from '@/lib/bands';
import { getPublicPhotographers, photographerSlug } from '@/lib/photographers';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Never lists /song-club, /w or the vanity paths: those 308 to Songhaus.
  const staticPaths = ['', '/archive', '/bands', '/videos', '/upcoming', '/contact'];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const today = getTodayCentral();
  const [shows, bands, photographers] = await Promise.all([
    getAllShows(),
    getAllBands(),
    getPublicPhotographers(),
  ]);

  // Only public show pages: past shows (already happened) and announced
  // upcoming, at their one URL per night (/shows/BH-…; old slug URLs 308
  // there). Cancelled / postponed nights are noindex, so they're left out.
  const showEntries: MetadataRoute.Sitemap = shows
    .filter((show) => (show.date < today || show.announced) && show.status === 'scheduled')
    .map((show) => ({
      url: `${SITE_URL}/shows/${show.catalogueId}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));

  const bandEntries: MetadataRoute.Sitemap = bands.map((band) => ({
    url: `${SITE_URL}/bands/${band.slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  const photographerEntries: MetadataRoute.Sitemap = photographers.map((photographer) => ({
    url: `${SITE_URL}/photos/${photographerSlug(photographer.name)}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticEntries, ...showEntries, ...bandEntries, ...photographerEntries];
}
