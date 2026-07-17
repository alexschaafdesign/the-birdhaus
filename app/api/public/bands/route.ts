// DEPRECATED as of 2026-07-17 — see TODO.md ("Part D: Remove deprecated
// /api/public/bands"). Twin Scene's scraper lineup matcher now queries its
// own canonical bands table directly instead of calling this route, and
// Crawlspace's createTwinSceneBand() now posts through Twin Scene's own
// /api/public/bands instead of this one. Kept live (not deleted) until the
// no-traffic window in TODO.md confirms no other consumer depends on it.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import { getAllBands, findOrCreateBandByName, type Band, type TwinSceneBandProfile } from '@/lib/bands';

// Explicit public allowlist, decided deliberately with the site owner field
// by field — see conversation history, not derived from the Band type. A new
// field added to Band later is NOT exposed here until someone adds it below
// on purpose. Excluded on purpose: id (internal PK), contactEmail/contactMethod
// (ours, about the band, not public), twinsceneSlug (their own bookkeeping
// identifier, circular to hand back), members (personal names — consent for
// "shown on our bio page" isn't consent for "redistributed via a scrapable
// third-party feed").
const PUBLIC_BAND_FIELDS = [
  'slug',
  'name',
  'instagram',
  'bio',
  'photo',
  'isTouring',
  'hometown',
  'genres',
  'city',
  'neighborhoods',
  'website',
  'bandcamp',
  'bandcampEmbedUrl',
  'bandcampEmbedHeight',
  'featuredLinks',
] as const;

// Fails to compile if a typo'd or renamed field above no longer exists on Band.
const _publicFieldsAreValid: ReadonlyArray<keyof Band> = PUBLIC_BAND_FIELDS;

type PublicBand = Pick<Band, (typeof PUBLIC_BAND_FIELDS)[number]>;

function toPublicBand(band: Band): PublicBand {
  const result = {} as PublicBand;
  for (const field of PUBLIC_BAND_FIELDS) {
    (result as Record<string, unknown>)[field] = band[field];
  }
  return result;
}

// CORS governs which browser-side JS can call this directly — it is not the
// access control. The x-api-key check below is. A stolen/leaked key still
// works from curl or a server regardless of this header.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Shared by GET and POST. Returns an error response to short-circuit on, or
// null if the key checked out (and last_used_at was bumped).
async function authenticate(request: Request): Promise<NextResponse | null> {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401, headers: CORS_HEADERS });
  }

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const [key] = await sql<Array<{ id: number }>>`
    select id from api_keys
    where key_hash = ${keyHash} and revoked_at is null
    limit 1
  `;

  if (!key) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401, headers: CORS_HEADERS });
  }

  await sql`update api_keys set last_used_at = now() where id = ${key.id}`;
  return null;
}

export async function GET(request: Request) {
  const authError = await authenticate(request);
  if (authError) return authError;

  const bands = await getAllBands();
  return NextResponse.json(bands.map(toPublicBand), { headers: CORS_HEADERS });
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return items.length > 0 ? items : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toFeaturedLinks(value: unknown): Band['featuredLinks'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const links = value
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({
      url: typeof l.url === 'string' ? l.url : '',
      label: typeof l.label === 'string' ? l.label : '',
      image: typeof l.image === 'string' ? l.image : '',
    }))
    .filter((l) => l.url);
  return links.length > 0 ? links : undefined;
}

// Everything here is optional — Twin Scene can still call with just `name`
// (the original lineup-matcher behavior). Field-by-field, same allowlist as
// TWINSCENE_MERGE_FIELDS in lib/bands.ts.
function parseTwinSceneProfile(body: Record<string, unknown>): TwinSceneBandProfile {
  return {
    bio: toOptionalString(body.bio),
    photo: toOptionalString(body.photo),
    instagram: toOptionalString(body.instagram),
    genres: toStringArray(body.genres),
    city: toOptionalString(body.city),
    neighborhoods: toStringArray(body.neighborhoods),
    members: toStringArray(body.members),
    contactEmail: toOptionalString(body.contactEmail),
    contactMethod: toOptionalString(body.contactMethod),
    website: toOptionalString(body.website),
    bandcamp: toOptionalString(body.bandcamp),
    bandcampEmbedUrl: toOptionalString(body.bandcampEmbedUrl),
    bandcampEmbedHeight: toOptionalNumber(body.bandcampEmbedHeight),
    featuredLinks: toFeaturedLinks(body.featuredLinks),
    twinSceneBandId: toOptionalNumber(body.twinSceneBandId),
  };
}

// Lets a partner project (Twin Scene) match a scraped show lineup against our
// band directory, creating a new unreviewed band when no match exists rather
// than dropping the lineup entry. Twin Scene can optionally include its own
// profile data (bio, photo, twinSceneBandId, ...) alongside `name` — filled
// in fill-only-if-empty on an existing match, or written wholesale onto a new
// stub, so a band Twin Scene already has a full profile for doesn't land here
// permanently blank.
export async function POST(request: Request) {
  const authError = await authenticate(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400, headers: CORS_HEADERS });
  }

  const profile = parseTwinSceneProfile((body ?? {}) as Record<string, unknown>);
  const result = await findOrCreateBandByName(name, profile);
  if (result.created) {
    console.log(`[public/bands] auto-created band "${name}" -> slug "${result.slug}"`);
  }
  return NextResponse.json(result, { status: result.created ? 201 : 200, headers: CORS_HEADERS });
}
