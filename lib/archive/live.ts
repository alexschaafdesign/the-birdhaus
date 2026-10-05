import { getAllShows, getTodayCentral, type Show } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import { getPhotographerCredits } from '@/lib/photographers';
import { catalogueId, freshCutsTag, to24h } from '@/lib/catalogue';
import type { ArchiveSet, Night } from './types';

// Adapts the shows table (lib/shows) into archive Nights — the shows table is
// the one list of nights; this is a view of it, not a copy. What the table
// doesn't store yet stays absent: set durations, setlists, per-set audio and
// photos, cameras/channels, release refs. Song Club (SC-###) nights aren't
// adapted until SC numbers are stored (see the migration gaps in the PR).

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function setsFor(show: Show, bandSlugs: Map<number, string>): ArchiveSet[] {
  const used = new Set<string>();
  return show.bands.map((entry, i) => {
    const band = typeof entry === 'string' ? { name: entry } : entry;
    const bandSlug = 'bandId' in band && band.bandId != null ? bandSlugs.get(Number(band.bandId)) : undefined;

    // Anchors must be unique within the night even if a band name repeats.
    let slug = bandSlug ?? (slugify(band.name) || `set-${i + 1}`);
    if (used.has(slug)) slug = `${slug}-${i + 1}`;
    used.add(slug);

    // Videos are tagged per band (band_videos); a set gets the first one
    // tagged to its band.
    const bandId = 'bandId' in band && band.bandId != null ? Number(band.bandId) : null;
    const video =
      bandId != null
        ? show.videos.find((v) => v.bandIds?.some((id) => Number(id) === bandId))
        : undefined;

    return {
      order: i + 1,
      band: band.name,
      bandSlug,
      slug,
      start: ('setStart' in band && to24h(band.setStart)) || undefined,
      media: video ? { video: { youtube: video.youtube, title: video.title } } : {},
    };
  });
}

export async function getLiveNights(): Promise<Night[]> {
  const [shows, bandSlugs] = await Promise.all([getAllShows(), getAllBandSlugs()]);
  const today = getTodayCentral();
  const past = shows
    .filter((s) => s.date < today && (s.type ?? 'show') === 'show')
    // Oldest first (then id) so a same-date collision suffixes the later row.
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.id) - Number(b.id));

  const credits = await getPhotographerCredits(
    past.flatMap((s) => (s.photos ?? []).map((p) => p.photographerId)).filter((n): n is number => n != null)
  );

  // BH ids derive from the date, so two shows on one date would collide. The
  // later one gets a letter suffix (BH-250307B) rather than a silent clash.
  const seen = new Map<string, number>();

  return past
    .map((show): Night => {
      const base = catalogueId(show.date);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}${String.fromCharCode(65 + n)}`;

      const sets = setsFor(show, bandSlugs);
      const setVideos = new Set(sets.map((s) => s.media.video?.youtube).filter(Boolean));

      const photos = (show.photos ?? []).map((p) => ({
        url: p.url,
        credit: p.photographerId != null ? credits.get(Number(p.photographerId))?.name : undefined,
      }));
      const legacyPhotographer =
        typeof show.photographer === 'string' ? show.photographer : show.photographer?.name;
      const photoCredits = [
        ...new Set([
          ...photos.map((p) => p.credit).filter((c): c is string => !!c),
          ...(show.photoCredit ? [show.photoCredit] : []),
        ]),
      ];
      if (photoCredits.length === 0 && legacyPhotographer) photoCredits.push(legacyPhotographer);

      const fc = freshCutsTag(show.slug);
      return {
        id,
        kind: 'bh',
        date: show.date,
        freshCuts: fc ? Number(fc.slice(3)) : undefined,
        title: sets.length === 0 ? show.title : undefined,
        sets,
        media: {
          // Untagged videos (no band) belong to the night as a whole.
          videos: show.videos
            .filter((v) => !setVideos.has(v.youtube))
            .map((v) => ({ youtube: v.youtube, title: v.title })),
          audio: (show.audio ?? []).map((a) => ({ bandcamp: a.bandcamp, title: a.title })),
          photos,
          photoFolder: show.photoFolder,
        },
        credits: {
          sound: show.soundEngineerName,
          photos: photoCredits.length ? photoCredits : undefined,
        },
      };
    })
    .reverse();
}
