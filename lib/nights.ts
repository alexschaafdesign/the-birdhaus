import { getNightDateCentral, slugify, type Show } from '@/lib/shows';
import { getPhotographerCredits, getPhotographerProfileBySlug } from '@/lib/photographers';
import type { GalleryPhoto } from '@/components/PhotoGallery';

// The one show page per night, /shows/[id] (2027). A night's URL is its
// catalogue id from announcement through archive, so a link shared before the
// show ends up at the recordings. This file reads the URL segment and decides
// which state the page renders; app/shows/[id]/page.tsx does the rest.

export type NightParam =
  | { kind: 'bh'; id: string; raw: string }
  | { kind: 'sad'; id: string; raw: string }
  | { kind: 'slug'; slug: string };

// "BH-250329" / "bh-250329b" → canonical "BH-250329b" (upper prefix, lower
// suffix, per the spec); "SAD-005" likewise. Anything else is an old slug URL.
// `raw` is the decoded segment, so the caller can 308 a different casing.
export function parseNightParam(raw: string): NightParam {
  const value = safeDecode(raw);
  const bh = value.match(/^bh-(\d{6})([a-z]?)$/i);
  if (bh) return { kind: 'bh', id: `BH-${bh[1]}${bh[2].toLowerCase()}`, raw: value };
  const sad = value.match(/^sad-(\d{3,})$/i);
  if (sad) return { kind: 'sad', id: `SAD-${sad[1]}`, raw: value };
  return { kind: 'slug', slug: value };
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// What the page shows below the (state-independent) header.
//   upcoming   flyer, lineup, set times, RSVP/tickets, door details
//   tonight    the same, set times up top (until 5am the morning after)
//   archived   the night as it was: sets, media, photos, credits — complete
//              even with nothing but a lineup
//   cancelled / postponed   a notice in place of tickets/RSVP
export type NightState = 'upcoming' | 'tonight' | 'archived' | 'cancelled' | 'postponed';

export function nightState(show: Pick<Show, 'date' | 'status'>, nightDate = getNightDateCentral()): NightState {
  if (show.status === 'cancelled') return 'cancelled';
  if (show.status === 'postponed') return 'postponed';
  if (show.date > nightDate) return 'upcoming';
  if (show.date === nightDate) return 'tonight';
  return 'archived';
}

// An unannounced show that hasn't happened yet is a private booking: 404 for
// everyone but admins (bands get details through the hub share token). Past
// shows stay public whatever the flag says — older nights were imported
// before `announced` existed and many still read false.
export function isPrivateBooking(show: Pick<Show, 'date' | 'announced'>, nightDate = getNightDateCentral()): boolean {
  return !show.announced && show.date >= nightDate;
}

// Re-serialises the incoming query so a redirect keeps it (utm tags etc).
export function queryString(params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v);
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export type PhotoCredit = { name: string; href?: string };

// The show's uploaded photos with per-photo credits (shown in the lightbox),
// plus one gallery-wide credit when they share a photographer. Legacy shows
// with no per-photo ids fall back to the show-level photographer name, linked
// to their profile only when they're in the registry (never the stored
// instagram value, which may be malformed). Moved from the old show page.
export async function showPhotoGallery(
  show: Show
): Promise<{ photos: GalleryPhoto[]; credit: PhotoCredit | null }> {
  const showPhotos = show.photos ?? [];
  const ids = showPhotos.map((p) => p.photographerId).filter((n): n is number => n != null);
  const credits = await getPhotographerCredits(ids);
  const photos = showPhotos.map((p) => ({
    url: p.url,
    credit: p.photographerId != null ? credits.get(p.photographerId) ?? null : null,
  }));

  const distinct = new Set(ids);
  if (distinct.size === 1 && showPhotos.every((p) => p.photographerId != null)) {
    const only = credits.get([...distinct][0]);
    if (only) return { photos, credit: { name: only.name, href: `/photos/${slugify(only.name)}` } };
  }
  if (distinct.size === 0) {
    const legacy =
      typeof show.photographer === 'string' ? show.photographer : show.photographer?.name ?? null;
    if (legacy) {
      const profile = await getPhotographerProfileBySlug(slugify(legacy));
      return { photos, credit: { name: legacy, href: profile ? `/photos/${slugify(legacy)}` : undefined } };
    }
  }
  return { photos, credit: null };
}
