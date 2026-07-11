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
    id: row.id,
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
      (select count(*)::int from shows s, jsonb_array_elements(s.bands) e
       where e ? 'bandId' and (e->>'bandId')::int = b.id) as play_count
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
  return new Map(rows.map((r) => [r.id, r.slug]));
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
    from shows s, jsonb_array_elements(s.bands) b
    where b ? 'bandId' and (b->>'bandId')::int = ${bandId}
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
    select s.slug as "showSlug", s.title as "showTitle", v->>'youtube' as youtube, v->>'title' as title
    from shows s, jsonb_array_elements(s.videos) v
    where v ? 'bandId' and (v->>'bandId')::int = ${bandId}
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
      resolved.push(band);
      continue;
    }

    const name = band.name.trim();
    const [existing] = await tx<Array<{ id: number }>>`
      select id from bands where lower(name) = lower(${name}) limit 1
    `;

    if (existing) {
      resolved.push({ ...band, bandId: existing.id });
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
    resolved.push({ ...band, bandId: created.id });
  }

  return resolved as Show['bands'];
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
