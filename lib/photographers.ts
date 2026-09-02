import { sql } from './db';
import { slugify, normalizePhotosInput } from './shows';

// Photographer registry (050_photographers.sql). Mirrors lib/sound-engineers'
// profile helpers. Photographers have no per-show join table — they're linked
// to shows only via the free-text name recorded on settlements — so the
// "shows worked" history is a name match against settlements.

export interface Photographer {
  id: number;
  name: string;
}

export async function getAllPhotographers(): Promise<Photographer[]> {
  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name from photographers order by name asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

// Minimal credit info for resolving per-photo photographer references
// (Show['photos'][].photographerId → name + instagram) when displaying a
// gallery. Returned as a Map keyed by id for O(1) lookup by callers.
export interface PhotographerCredit {
  id: number;
  name: string;
  instagram: string | null;
}

export async function getPhotographerCredits(
  ids: number[]
): Promise<Map<number, PhotographerCredit>> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return new Map();
  const rows = await sql<Array<{ id: number; name: string; instagram: string | null }>>`
    select id, name, instagram from photographers where id = any(${unique})
  `;
  return new Map(
    rows.map((r) => [Number(r.id), { id: Number(r.id), name: r.name, instagram: r.instagram }])
  );
}

export interface PhotographerProfile {
  id: number;
  name: string;
  photo: string | null;
  bio: string | null;
  instagram: string | null;
  contactEmail: string | null;
  // Payment handle (Venmo username, etc.), mirroring bands.payment_method.
  // Admin-only — surfaced on the settlement sheet when paying out.
  paymentMethod: string | null;
}

export async function getPhotographerProfile(id: number): Promise<PhotographerProfile | null> {
  const [row] = await sql<
    Array<{ id: number; name: string; photo: string | null; bio: string | null; instagram: string | null; contact_email: string | null; payment_method: string | null }>
  >`
    select id, name, photo, bio, instagram, contact_email, payment_method from photographers where id = ${id}
  `;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    photo: row.photo,
    bio: row.bio,
    instagram: row.instagram,
    contactEmail: row.contact_email,
    paymentMethod: row.payment_method,
  };
}

// Public photographer profiles are addressed by a slug derived from the name
// (names are unique — see the lower(name) unique index in 050_photographers.sql
// — so there's no id in the URL). Matches the show slug algorithm so links are
// consistent. Kept as a helper so callers building links and the lookup below
// stay in sync.
export function photographerSlug(name: string): string {
  return slugify(name);
}

export async function getPhotographerProfileBySlug(slug: string): Promise<PhotographerProfile | null> {
  // The table is tiny, so resolve the slug in JS against every name rather than
  // adding a stored slug column to maintain. Slug collisions between two
  // distinct names are vanishingly unlikely at this scale.
  const rows = await sql<
    Array<{ id: number; name: string; photo: string | null; bio: string | null; instagram: string | null; contact_email: string | null; payment_method: string | null }>
  >`
    select id, name, photo, bio, instagram, contact_email, payment_method from photographers
  `;
  const row = rows.find((r) => photographerSlug(r.name) === slug);
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    photo: row.photo,
    bio: row.bio,
    instagram: row.instagram,
    contactEmail: row.contact_email,
    paymentMethod: row.payment_method,
  };
}

// One show's worth of a photographer's photos, for the public profile gallery.
// Built by getPhotographerGalleries (below).
export interface PhotographerGallery {
  showSlug: string;
  showTitle: string;
  date: string;
  photos: string[];
}

// Photographers with at least one credited photo on any show — i.e. those whose
// public profile page has content. Used for the sitemap. Pulls the distinct set
// of photographerIds referenced across all shows' `photos` arrays and joins to
// the registry for names. Legacy string-array photo rows contribute no ids.
export async function getPublicPhotographers(): Promise<Array<{ id: number; name: string }>> {
  const rows = await sql<Array<{ id: number; name: string }>>`
    select p.id, p.name
    from photographers p
    where p.id in (
      select distinct (elem->>'photographerId')::int
      from shows s, jsonb_array_elements(s.photos) elem
      where jsonb_typeof(s.photos) = 'array'
        and elem->>'photographerId' is not null
    )
    or exists (
      select 1 from shows s
      where lower(s.photographer->>'name') = lower(p.name)
        and jsonb_typeof(s.photos) = 'array'
        and jsonb_array_length(s.photos) > 0
    )
    order by p.name asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

// Two sources are unioned:
//   1. per-photo credits — shows whose `photos` array has an entry with this
//      photographerId (just those photos), and
//   2. legacy galleries — shows with NO per-photo credits whose show-level
//      photographer name matches (the whole gallery is theirs).
// So older shows credited only via the show-level photographer field still
// appear on the profile automatically, without re-crediting each photo.
export async function getPhotographerGalleries(
  photographerId: number,
  name: string
): Promise<PhotographerGallery[]> {
  const rows = await sql<
    Array<{ slug: string; title: string; date: string; photos: unknown; photographer: unknown }>
  >`
    select slug, title, date::text as date, photos, photographer
    from shows
    where photos @> ${JSON.stringify([{ photographerId }])}::jsonb
       or lower(photographer->>'name') = lower(${name})
    order by date desc
  `;
  const galleries: PhotographerGallery[] = [];
  for (const row of rows) {
    const entries = normalizePhotosInput(row.photos);
    const own = entries.filter((p) => p.photographerId === photographerId).map((p) => p.url);
    let photos: string[] = own;
    if (own.length === 0 && entries.every((p) => p.photographerId == null)) {
      // No per-photo credits on this show — treat the whole gallery as theirs
      // when the legacy show-level photographer name matches.
      const legacy =
        row.photographer && typeof row.photographer === 'object'
          ? (row.photographer as { name?: unknown }).name
          : row.photographer;
      if (typeof legacy === 'string' && legacy.trim().toLowerCase() === name.trim().toLowerCase()) {
        photos = entries.map((p) => p.url);
      }
    }
    if (photos.length > 0) {
      galleries.push({ showSlug: row.slug, showTitle: row.title, date: row.date, photos });
    }
  }
  return galleries;
}

// Shows this photographer shot, matched by the name on each settlement (there's
// no structured per-show link). Newest first.
export interface PhotographerShow {
  id: number;
  slug: string;
  title: string;
  date: string;
}

export async function getShowsForPhotographer(name: string): Promise<PhotographerShow[]> {
  const rows = await sql<Array<{ id: number; slug: string; title: string; date: string }>>`
    select s.id, s.slug, s.title, s.date::text as date
    from settlements st
    join shows s on s.id = st.show_id
    where lower(trim(st.photographer_name)) = lower(trim(${name}))
    order by s.date desc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, title: r.title, date: r.date }));
}
