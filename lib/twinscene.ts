// Client for Twin Scene's public band directory. Twin Scene is now the
// canonical source of band profile data (bio, photo, genres, ...) and, since
// the bands-overlay migration (017), the canonical band directory itself —
// Birdhaus's own `bands` table is a local overlay keyed to it via
// bands.twin_scene_band_id. Backs two consumers in lib/bands.ts: the Edit
// Show form typeahead's just-in-time sync (syncBandFromTwinScene) and the
// admin-triggered bulk enrichment pull (enrichBandsFromTwinScene).
//
// Mirrors Twin Scene's own lib/birdhaus.ts (its client for reading Birdhaus's
// public API) — same defensive-parse-every-field approach, since this reads
// a response shape owned by another codebase. Also mirrors the contract
// Birdhaus itself exposes to Twin Scene at app/api/public/bands/route.ts:
// x-api-key auth, full-list only, no per-id lookup.

export interface TwinSceneSocials {
  instagram?: string;
  website?: string;
  bandcamp?: string;
  bandcampLink?: string;
}

export interface TwinSceneFeaturedLink {
  url: string;
  label: string;
  image: string;
}

export interface TwinSceneBand {
  id: number;
  slug: string;
  name: string;
  genre: string;
  socials: TwinSceneSocials;
  bio: string;
  photo: string;
  city: string;
  neighborhoods: string[];
  bandcampEmbedUrl: string;
  bandcampEmbedHeight: number | null;
  featuredLinks: TwinSceneFeaturedLink[];
  members: string[];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

function asFeaturedLinks(v: unknown): TwinSceneFeaturedLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({ url: asString(l.url), label: asString(l.label), image: asString(l.image) }))
    .filter((l) => l.url);
}

// `socials` is a free-form { platform: url } jsonb blob on Twin Scene's side.
// Its `bandcamp` entry is sometimes a raw <iframe> embed snippet rather than
// a page URL, and `bandcampLink` (when present) is the cleaner one — kept as
// separate fields here rather than collapsed, so callers can choose. See
// cleanBandcampUrl() below for the "give me one usable URL" helper.
function asSocials(v: unknown): TwinSceneSocials {
  if (!v || typeof v !== 'object') return {};
  const r = v as Record<string, unknown>;
  const instagram = asString(r.instagram);
  const website = asString(r.website);
  const bandcamp = asString(r.bandcamp);
  const bandcampLink = asString(r.bandcampLink);
  return {
    ...(instagram && { instagram }),
    ...(website && { website }),
    ...(bandcamp && { bandcamp }),
    ...(bandcampLink && { bandcampLink }),
  };
}

function parseBand(raw: unknown): TwinSceneBand | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'number' ? r.id : Number(r.id);
  if (!Number.isFinite(id) || !asString(r.slug)) return null;

  return {
    id,
    slug: asString(r.slug),
    name: asString(r.name),
    genre: asString(r.genre),
    socials: asSocials(r.socials),
    bio: asString(r.bio),
    photo: asString(r.photo),
    city: asString(r.city),
    neighborhoods: asStringArray(r.neighborhoods),
    bandcampEmbedUrl: asString(r.bandcamp_embed_url),
    bandcampEmbedHeight: typeof r.bandcamp_embed_height === 'number' ? r.bandcamp_embed_height : null,
    featuredLinks: asFeaturedLinks(r.featured_links),
    members: asStringArray(r.members),
  };
}

// Full-list fetch — there's no per-id endpoint on Twin Scene's side, same as
// Birdhaus's own public API. No caching: called from explicit admin actions
// (the typeahead's once-per-form-load fetch, the enrichment button/script),
// never from page rendering, so a TTL cache isn't needed here.
export async function getTwinSceneBands(): Promise<TwinSceneBand[]> {
  const baseUrl = process.env.TWIN_SCENE_API_URL;
  const apiKey = process.env.TWIN_SCENE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('TWIN_SCENE_API_URL/TWIN_SCENE_API_KEY not configured. See .env.example.');
  }

  const res = await fetch(`${baseUrl}/api/public/bands`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Twin Scene request failed (${res.status})`);
  }

  const body = await res.json();
  const list = Array.isArray(body) ? body : Array.isArray(body?.bands) ? body.bands : null;
  if (!Array.isArray(list)) {
    throw new Error('Twin Scene returned an unexpected response shape');
  }

  return list.map(parseBand).filter((b): b is TwinSceneBand => b !== null);
}

export interface CreatedTwinSceneBand {
  id: number;
  slug: string;
  name: string;
  // false when a new unreviewed band was created, true when an existing
  // Twin Scene band matched the name case-insensitively.
  matched: boolean;
}

// Write path: create (or find, case-insensitively) a band in Twin Scene's
// canonical directory. Birdhaus's API key is provisioned can_write=true, so
// this is allowed; POST /api/public/bands is a find-or-create that returns the
// canonical record plus a `matched` flag (see twinscene's app/api/public/bands
// route + toPublicBand). Used by the Edit Show form's save path so a brand-new
// band an operator types gets pushed up to Twin Scene and linked, instead of
// staying a Birdhaus-only orphan. Mirrors crawlspace's createTwinSceneBand().
export async function createTwinSceneBand(name: string): Promise<CreatedTwinSceneBand> {
  const baseUrl = process.env.TWIN_SCENE_API_URL;
  const apiKey = process.env.TWIN_SCENE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('TWIN_SCENE_API_URL/TWIN_SCENE_API_KEY not configured. See .env.example.');
  }

  const res = await fetch(`${baseUrl}/api/public/bands`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Twin Scene band create failed (${res.status})`);
  }

  const body = (await res.json()) as Record<string, unknown>;
  const id = typeof body.id === 'number' ? body.id : Number(body.id);
  const slug = asString(body.slug);
  if (!Number.isFinite(id) || !slug) {
    throw new Error('Twin Scene band create returned no id/slug');
  }
  return {
    id,
    slug,
    name: asString(body.name) || name,
    matched: body.matched === true,
  };
}

export function splitGenres(genre: string): string[] {
  return genre
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

// Only trust a socials value as a bandcamp link if it actually looks like a
// URL — `socials.bandcamp` sometimes holds raw embed <iframe> markup instead.
export function cleanBandcampUrl(socials: TwinSceneSocials): string | null {
  for (const candidate of [socials.bandcampLink, socials.bandcamp]) {
    if (candidate && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  return null;
}
