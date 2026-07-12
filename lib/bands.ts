import postgres from 'postgres';
import { sql } from './db';
import type { Show } from './shows';

export interface FeaturedLink {
  url: string;
  label: string;
  image: string;
}

export interface Band {
  id: number;
  slug: string;
  name: string;
  instagram?: string;
  bio?: string;
  photo?: string;
  isTouring: boolean;
  hometown?: string;
  // Fields absorbed from the Twin Scene directory — not yet surfaced in
  // Birdhaus's own admin/public UI, but stored so a future consumer (Twin
  // Scene, or another project) can read them from this shared table.
  genres: string[];
  city?: string;
  neighborhoods: string[];
  members: string[];
  contactEmail?: string;
  contactMethod?: string;
  website?: string;
  bandcamp?: string;
  bandcampEmbedUrl?: string;
  bandcampEmbedHeight?: number;
  featuredLinks: FeaturedLink[];
  twinsceneSlug?: string;
}

interface BandRow {
  id: number;
  slug: string;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  is_touring: boolean;
  hometown: string | null;
  genres: unknown;
  city: string | null;
  neighborhoods: unknown;
  members: unknown;
  contact_email: string | null;
  contact_method: string | null;
  website: string | null;
  bandcamp: string | null;
  bandcamp_embed_url: string | null;
  bandcamp_embed_height: number | null;
  featured_links: unknown;
  twinscene_slug: string | null;
}

function rowToBand(row: BandRow): Band {
  return {
    // bands.id is bigserial — the postgres driver serializes int8 columns as
    // strings over the wire despite BandRow's `number` annotation; coerce back
    // so Band.id matches the bandId numbers stored in shows.bands JSON.
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    instagram: row.instagram ?? undefined,
    bio: row.bio ?? undefined,
    photo: row.photo ?? undefined,
    isTouring: row.is_touring,
    hometown: row.hometown ?? undefined,
    genres: (row.genres as string[]) ?? [],
    city: row.city ?? undefined,
    neighborhoods: (row.neighborhoods as string[]) ?? [],
    members: (row.members as string[]) ?? [],
    contactEmail: row.contact_email ?? undefined,
    contactMethod: row.contact_method ?? undefined,
    website: row.website ?? undefined,
    bandcamp: row.bandcamp ?? undefined,
    bandcampEmbedUrl: row.bandcamp_embed_url ?? undefined,
    bandcampEmbedHeight: row.bandcamp_embed_height ?? undefined,
    featuredLinks: (row.featured_links as FeaturedLink[]) ?? [],
    twinsceneSlug: row.twinscene_slug ?? undefined,
  };
}

// Small local copy — mirrors lib/shows.ts's slugify() and ShowForm.tsx's own
// client-side copy. Kept separate so this module doesn't pull in remark just
// for a string helper.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getAllBands(): Promise<Band[]> {
  const rows = await sql<BandRow[]>`select * from bands order by name asc`;
  return rows.map(rowToBand);
}

// Same as getAllBands, plus how many Birdhaus shows each band has actually
// played — used by the public gallery to default to "played here" while
// still letting the full shared directory (including Twin Scene imports
// that never played Birdhaus) be revealed on demand.
export async function getAllBandsWithPlayCount(): Promise<Array<Band & { playCount: number }>> {
  const rows = await sql<Array<BandRow & { play_count: number }>>`
    select b.*,
      (select count(*)::int from show_bands sb where sb.band_id = b.id) as play_count
    from bands b
    order by b.name asc
  `;
  return rows.map((row) => ({ ...rowToBand(row), playCount: row.play_count }));
}

export async function getBandBySlug(slug: string): Promise<Band | null> {
  const [row] = await sql<BandRow[]>`select * from bands where slug = ${slug} limit 1`;
  return row ? rowToBand(row) : null;
}

// Whole id->slug map, cheap at this table's scale — reused by the show detail
// page and the home/archive alum rosters to resolve a bandId into a link.
export async function getAllBandSlugs(): Promise<Map<number, string>> {
  const rows = await sql<Array<{ id: number; slug: string }>>`select id, slug from bands`;
  return new Map(rows.map((r) => [Number(r.id), r.slug]));
}

export interface BandShow {
  id: number;
  slug: string;
  title: string;
  date: string;
}

export async function getShowsForBand(bandId: number): Promise<BandShow[]> {
  return sql<BandShow[]>`
    select s.id, s.slug, s.title, s.date::text as date
    from show_bands sb
    join shows s on s.id = sb.show_id
    where sb.band_id = ${bandId}
    order by s.date desc
  `;
}

export interface BandVideo {
  showSlug: string;
  showTitle: string;
  youtube: string;
  title: string;
}

export async function getVideosForBand(bandId: number): Promise<BandVideo[]> {
  return sql<BandVideo[]>`
    select s.slug as "showSlug", s.title as "showTitle", v.youtube, v.title
    from band_videos bv
    join videos v on v.id = bv.video_id
    join show_videos sv on sv.video_id = v.id
    join shows s on s.id = sv.show_id
    where bv.band_id = ${bandId}
    order by s.date desc
  `;
}

type Tx = postgres.TransactionSql;

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await tx`select 1 from bands where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// Resolves each show band entry to a real bands.id, creating a new band
// profile for any name that doesn't already match one. Runs inside the
// caller's transaction so a failed show save can't leave orphan bands, and
// two new same-named entries in one show correctly resolve to a single row.
export async function resolveShowBandEntries(bands: Show['bands'], tx: Tx): Promise<Show['bands']> {
  const resolved: NonNullable<unknown>[] = [];

  for (const raw of bands) {
    const band = typeof raw === 'string' ? { name: raw } : raw;
    const existingBandId = (band as { bandId?: number }).bandId;
    if (existingBandId) {
      // The operator can edit instagram/bio/photo for an already-linked band
      // right here in the show form — without this, those edits only ever
      // landed in this show's own `bands` JSONB, which the Bands directory
      // never reads, so they'd silently vanish from the band's real profile.
      // coalesce() so a field the operator left blank on this particular show
      // doesn't blank out an existing value on the band's profile.
      const instagram = (band as { instagram?: string }).instagram ?? null;
      const bio = (band as { bio?: string }).bio ?? null;
      const photo = (band as { photo?: string }).photo ?? null;
      if (instagram !== null || bio !== null || photo !== null) {
        await tx`
          update bands
          set
            instagram = coalesce(${instagram}, instagram),
            bio = coalesce(${bio}, bio),
            photo = coalesce(${photo}, photo),
            updated_at = now()
          where id = ${existingBandId}
        `;
      }
      resolved.push(band);
      continue;
    }

    const name = band.name.trim();
    const [existing] = await tx<Array<{ id: number }>>`
      select id from bands where lower(name) = lower(${name}) limit 1
    `;

    if (existing) {
      // bands.id is bigserial — the driver returns int8 columns as strings
      // despite the `{ id: number }` annotation above; coerce so the bandId
      // stored in this show's JSON is a real number, not "93".
      resolved.push({ ...band, bandId: Number(existing.id) });
      continue;
    }

    const slug = await uniqueSlug(tx, slugify(name) || 'band');
    const instagram = (band as { instagram?: string }).instagram ?? null;
    const bio = (band as { bio?: string }).bio ?? null;
    const photo = (band as { photo?: string }).photo ?? null;
    const [created] = await tx<Array<{ id: number }>>`
      insert into bands (slug, name, instagram, bio, photo)
      values (${slug}, ${name}, ${instagram}, ${bio}, ${photo})
      returning id
    `;
    resolved.push({ ...band, bandId: Number(created.id) });
  }

  return resolved as Show['bands'];
}

export interface ResolvedBand {
  slug: string;
  created: boolean;
}

// Used by the public write-back endpoint (Twin Scene lineup matching against
// our band directory). Same case-insensitive match + slug generation as
// resolveShowBandEntries, but standalone rather than operating over a show's
// bands array, and marks new rows unreviewed so they can be triaged in admin
// before being treated as a real Birdhaus band rather than scraper noise.
export async function findOrCreateBandByName(name: string): Promise<ResolvedBand> {
  return sql.begin(async (tx) => {
    const [existing] = await tx<Array<{ slug: string }>>`
      select slug from bands where lower(name) = lower(${name}) limit 1
    `;
    if (existing) return { slug: existing.slug, created: false };

    const slug = await uniqueSlug(tx, slugify(name) || 'band');
    const [created] = await tx<Array<{ slug: string }>>`
      insert into bands (slug, name, unreviewed)
      values (${slug}, ${name}, true)
      returning slug
    `;
    return { slug: created.slug, created: true };
  });
}

export interface ShowBandPair {
  bandId: number;
  sortOrder: number;
}

// Derives the show_bands rows (bandId + array-position sort order) from a
// resolveShowBandEntries() result — every entry is guaranteed a bandId by then.
export function toShowBandPairs(resolved: Show['bands']): ShowBandPair[] {
  return resolved.map((band, index) => ({
    bandId: (band as { bandId?: number }).bandId as number,
    sortOrder: index,
  }));
}

// Replaces a show's show_bands rows wholesale — simplest correct way to apply
// reordering/additions/removals from a full-array save without diffing. Runs
// in the same transaction as the show save, alongside (not replacing) the
// existing bands JSONB write.
export async function setShowBands(showId: number, bands: ShowBandPair[], tx: Tx): Promise<void> {
  await tx`delete from show_bands where show_id = ${showId}`;
  if (bands.length === 0) return;
  const rows = bands.map((b) => ({ show_id: showId, band_id: b.bandId, sort_order: b.sortOrder }));
  await tx`insert into show_bands ${tx(rows, 'show_id', 'band_id', 'sort_order')}`;
}

// Maps each video's transient `bandIndex` (the video row's position within
// the *same request's* bands array, as sent by ShowForm.tsx) to the real
// bandId that resolveShowBandEntries just resolved that position to — bridges
// "which band row is this a video of" to a real id even when that band was
// just created in this same save. `bandIndex` is never itself persisted; a
// video that already carries a `bandId` (from a prior save) keeps it as-is.
export function resolveVideoBandIds(
  videos: unknown[],
  resolvedBands: Show['bands'] | undefined
): Show['videos'] {
  return videos.map((raw) => {
    const { bandIndex, ...rest } = raw as Record<string, unknown>;
    if (typeof bandIndex === 'number' && resolvedBands?.[bandIndex]) {
      const bandId = (resolvedBands[bandIndex] as { bandId?: number }).bandId;
      if (bandId) return { ...rest, bandId } as Show['videos'][number];
    }
    return rest as Show['videos'][number];
  });
}
