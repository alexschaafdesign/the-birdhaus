// Read-only client for Twin Scene's public band directory. Twin Scene is now
// the canonical source of band profile data (bio, photo, genres, ...);
// Birdhaus's own `bands` table is an overlay keyed to it via
// bands.twin_scene_band_id (see migration 017_bands_overlay.sql). This client
// backs the enrichment pull in enrichBandFromTwinScene() (lib/bands.ts).
//
// Mirrors Twin Scene's own lib/birdhaus.ts (its client for reading Birdhaus's
// public API) — same defensive-parse-every-field approach, since this reads
// a response shape owned by another codebase.

export interface TwinSceneBand {
  id: number;
  slug: string;
  name: string;
  genre: string;
  socials: { instagram?: string; website?: string; bandcamp?: string };
  bio: string;
  photo: string;
  city: string;
  neighborhoods: string[];
  bandcampEmbedUrl: string;
  bandcampEmbedHeight: number | null;
  featuredLinks: Array<{ url: string; label: string; image: string }>;
  members: string[];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

function asFeaturedLinks(v: unknown): TwinSceneBand['featuredLinks'] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({ url: asString(l.url), label: asString(l.label), image: asString(l.image) }))
    .filter((l) => l.url);
}

// `socials` is a free-form { platform: url } jsonb blob on Twin Scene's side.
// Its `bandcamp` entry in practice holds a raw <iframe> embed snippet, not a
// page URL — bandcampEmbedUrl (a separate, already-clean column) is the right
// source for that, so bandcamp is deliberately not read out of socials here.
function asSocials(v: unknown): TwinSceneBand['socials'] {
  if (!v || typeof v !== 'object') return {};
  const r = v as Record<string, unknown>;
  const instagram = asString(r.instagram);
  const website = asString(r.website);
  return { ...(instagram && { instagram }), ...(website && { website }) };
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

// No caching — this is called from an explicit admin-triggered sync (an API
// route and a one-off script), never from page rendering, so a TTL cache
// (like Twin Scene's own getCachedBirdhausBands) isn't needed here.
export async function fetchTwinSceneBands(): Promise<TwinSceneBand[]> {
  const apiUrl = process.env.TWINSCENE_API_URL;
  const apiKey = process.env.TWINSCENE_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error('TWINSCENE_API_URL / TWINSCENE_API_KEY are not set. See .env.example.');
  }

  const res = await fetch(apiUrl, { headers: { 'x-api-key': apiKey }, cache: 'no-store' });
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
