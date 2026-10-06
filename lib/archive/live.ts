import { sql } from '@/lib/db';
import { getAllShows, getTodayCentral, type Show } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import { getPhotographerCredits } from '@/lib/photographers';
import { catalogueId, freshCutsTag, to24h } from '@/lib/catalogue';
import type { ArchiveSet, Night, Photo, Release } from './types';

// Adapts the shows table (lib/shows) into archive Nights — the shows table is
// the one list of nights; this is a view of it, not a copy. Song Club events
// with a stored SC-### number (096) join them as SC nights.
//
// Set vs night media: audio and photo entries tagged with a bandId (093)
// belong to that band's set; untagged entries — or ones tagged to a band not
// in the lineup — stay night-level, so nothing is dropped. Video is tagged per
// band already (band_videos). Absent data stays absent: no set durations yet.

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Postgres bigint ids arrive as strings; key every map by a number.
const setKey = (showId: unknown, bandId: unknown) => `${Number(showId)}:${Number(bandId)}`;

type Extras = {
  notes: Map<string, string>;
  rig: Map<number, { cameraCount?: number; channelCount?: number }>;
  cameraOps: Map<number, string[]>;
  /** Keyed by setKey for a set, or by `${showId}:night` for the whole night. */
  releases: Map<string, Release[]>;
};

// The archive-only fields (093–095: set notes, show_rig, show_credits,
// release_links), read for every past show in one batch.
async function loadExtras(showIds: number[]): Promise<Extras> {
  const [notes, rig, ops, links] = await Promise.all([
    sql<Array<{ show_id: string; band_id: string; notes: string }>>`
      select show_id, band_id, notes from show_bands
      where show_id = any(${showIds}) and btrim(coalesce(notes, '')) <> ''
    `,
    sql<Array<{ show_id: string; camera_count: number | null; channel_count: number | null }>>`
      select show_id, camera_count, channel_count from show_rig
      where show_id = any(${showIds})
    `,
    sql<Array<{ show_id: string; name: string }>>`
      select show_id, name from show_credits
      where show_id = any(${showIds}) and role = 'camera'
      order by show_id, position, name
    `,
    sql<Array<{ show_id: string; band_id: string | null; catalogue_id: string; title: string; url: string | null }>>`
      select rl.show_id, rl.band_id, r.catalogue_id, r.title, r.url
      from release_links rl join releases r on r.id = rl.release_id
      where rl.show_id = any(${showIds})
      order by r.catalogue_id
    `,
  ]);

  const extras: Extras = { notes: new Map(), rig: new Map(), cameraOps: new Map(), releases: new Map() };
  for (const r of notes) extras.notes.set(setKey(r.show_id, r.band_id), r.notes.trim());
  for (const r of rig) {
    extras.rig.set(Number(r.show_id), {
      cameraCount: r.camera_count ?? undefined,
      channelCount: r.channel_count ?? undefined,
    });
  }
  for (const r of ops) {
    const id = Number(r.show_id);
    extras.cameraOps.set(id, [...(extras.cameraOps.get(id) ?? []), r.name]);
  }
  for (const r of links) {
    const key = r.band_id == null ? `${Number(r.show_id)}:night` : setKey(r.show_id, r.band_id);
    const release = { id: r.catalogue_id, title: r.title, url: r.url ?? undefined };
    extras.releases.set(key, [...(extras.releases.get(key) ?? []), release]);
  }
  return extras;
}

function setsFor(
  show: Show,
  bandSlugs: Map<number, string>,
  extras: Extras,
  photosOf: (bandId: number) => Photo[]
): ArchiveSet[] {
  const used = new Set<string>();
  return show.bands.map((entry, i) => {
    const band = typeof entry === 'string' ? { name: entry } : entry;
    const bandId = 'bandId' in band && band.bandId != null ? Number(band.bandId) : null;
    const bandSlug = bandId != null ? bandSlugs.get(bandId) : undefined;

    // Anchors must be unique within the night even if a band name repeats.
    let slug = bandSlug ?? (slugify(band.name) || `set-${i + 1}`);
    if (used.has(slug)) slug = `${slug}-${i + 1}`;
    used.add(slug);

    if (bandId == null) {
      return { order: i + 1, band: band.name, slug, media: {} };
    }

    // A set's first tagged video is its player and the rest list under it;
    // it gets the first audio tagged to its band, and every photo.
    const [video, ...moreVideos] = show.videos.filter((v) => v.bandIds?.some((id) => Number(id) === bandId));
    const audio = (show.audio ?? []).find((a) => a.bandId != null && Number(a.bandId) === bandId);
    const photos = photosOf(bandId);
    const key = setKey(show.id, bandId);

    return {
      order: i + 1,
      band: band.name,
      bandSlug,
      slug,
      start: ('setStart' in band && to24h(band.setStart)) || undefined,
      media: {
        ...(video && { video: { youtube: video.youtube, title: video.title } }),
        ...(moreVideos.length > 0 && {
          moreVideos: moreVideos.map((v) => ({ youtube: v.youtube, title: v.title })),
        }),
        ...(audio && { audio: { bandcamp: audio.bandcamp, title: audio.title } }),
        ...(photos.length > 0 && { photos }),
      },
      notes: extras.notes.get(key),
      releases: extras.releases.get(key),
    };
  });
}

// Song Club events become SC nights once they have a stored number (096) and
// are over. No sets: the title stands in for a lineup.
async function songClubNights(today: string): Promise<Night[]> {
  const rows = await sql<
    Array<{ title: string; event_date: string; end_date: string | null; format: string; catalogue_number: number }>
  >`
    select title, event_date::text, end_date::text, format, catalogue_number
    from song_club_events
    where published and catalogue_number is not null
      and coalesce(end_date, event_date) < ${today}::date
  `;
  return rows.map((r) => ({
    id: `SC-${String(r.catalogue_number).padStart(3, '0')}`,
    kind: 'sc',
    date: r.event_date,
    endDate: r.end_date ?? undefined,
    title: r.format === 'online' ? `${r.title} [online]` : r.title,
    sets: [],
    media: {},
    credits: {},
  }));
}

export async function getLiveNights(): Promise<Night[]> {
  const [shows, bandSlugs] = await Promise.all([getAllShows(), getAllBandSlugs()]);
  const today = getTodayCentral();
  const past = shows
    .filter((s) => s.date < today && (s.type ?? 'show') === 'show')
    // Oldest first (then id) so a same-date collision suffixes the later row.
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.id) - Number(b.id));

  const [credits, extras, scNights] = await Promise.all([
    getPhotographerCredits(
      past.flatMap((s) => (s.photos ?? []).map((p) => p.photographerId)).filter((n): n is number => n != null)
    ),
    loadExtras(past.map((s) => Number(s.id))),
    songClubNights(today),
  ]);

  // BH ids derive from the date, so two shows on one date would collide. The
  // later one gets a letter suffix (BH-250307B) rather than a silent clash.
  const seen = new Map<string, number>();

  const showNights = past.map((show): Night => {
    const base = catalogueId(show.date);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}${String.fromCharCode(65 + n)}`;

    const lineupIds = new Set(
      show.bands.flatMap((b) => (typeof b !== 'string' && b.bandId != null ? [Number(b.bandId)] : []))
    );
    // A tag only counts if that band is in the lineup; otherwise night-level.
    const setOf = (bandId: number | undefined) =>
      bandId != null && lineupIds.has(Number(bandId)) ? Number(bandId) : null;

    const allPhotos = (show.photos ?? []).map((p) => ({
      set: setOf(p.bandId),
      photo: {
        url: p.url,
        credit: p.photographerId != null ? credits.get(Number(p.photographerId))?.name : undefined,
      },
    }));
    const sets = setsFor(show, bandSlugs, extras, (bandId) =>
      allPhotos.filter((p) => p.set === bandId).map((p) => p.photo)
    );
    const setVideos = new Set(
      sets.flatMap((s) => [s.media.video, ...(s.media.moreVideos ?? [])]).map((v) => v?.youtube).filter(Boolean)
    );

    const legacyPhotographer =
      typeof show.photographer === 'string' ? show.photographer : show.photographer?.name;
    const photoCredits = [
      ...new Set([
        ...allPhotos.map((p) => p.photo.credit).filter((c): c is string => !!c),
        ...(show.photoCredit ? [show.photoCredit] : []),
      ]),
    ];
    if (photoCredits.length === 0 && legacyPhotographer) photoCredits.push(legacyPhotographer);

    const rig = extras.rig.get(Number(show.id));
    const ops = extras.cameraOps.get(Number(show.id));
    const fc = freshCutsTag(show.slug);
    return {
      id,
      kind: 'bh',
      date: show.date,
      freshCuts: fc ? Number(fc.slice(3)) : undefined,
      title: sets.length === 0 ? show.title : undefined,
      sets,
      media: {
        // Videos on no set (untagged, or tagged only to a band not in the
        // lineup) belong to the night as a whole.
        videos: show.videos
          .filter((v) => !setVideos.has(v.youtube))
          .map((v) => ({ youtube: v.youtube, title: v.title })),
        audio: (show.audio ?? [])
          .filter((a) => setOf(a.bandId) == null)
          .map((a) => ({ bandcamp: a.bandcamp, title: a.title })),
        photos: allPhotos.filter((p) => p.set == null).map((p) => p.photo),
        photoFolder: show.photoFolder,
      },
      credits: {
        sound: show.soundEngineerName,
        cameraCount: rig?.cameraCount,
        channels: rig?.channelCount,
        cameras: ops,
        photos: photoCredits.length ? photoCredits : undefined,
      },
      releases: extras.releases.get(`${Number(show.id)}:night`),
    };
  });

  return [...showNights, ...scNights].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
