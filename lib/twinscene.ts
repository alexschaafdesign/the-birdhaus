// Read-only client for Twin Scene's public band directory. Birdhaus owns its
// own `bands` table; Twin Scene is only a place to copy a profile from once,
// when a band is first added (the show form's typeahead import and the
// "Prefill from Twin Scene" button). Nothing here writes to Twin Scene, and
// nothing syncs after the copy.
//
// Same defensive parse-every-field approach as before, since this reads a
// response shape owned by another codebase.

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

// Full-list fetch (Twin Scene has no per-id endpoint). No caching: called only
// from admin actions (the typeahead's once-per-form-load fetch, an import, a
// prefill), never from page rendering.
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

// Case-insensitive exact name lookup for the "Prefill from Twin Scene" button.
export async function findTwinSceneBandByName(name: string): Promise<TwinSceneBand | null> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const bands = await getTwinSceneBands();
  return bands.find((b) => b.name.trim().toLowerCase() === wanted) ?? null;
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
