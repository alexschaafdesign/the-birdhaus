import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import { getAllBands, findOrCreateBandByName, type Band } from '@/lib/bands';

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

// Lets a partner project (Twin Scene) match a scraped show lineup against our
// band directory, creating a new unreviewed band when no match exists rather
// than dropping the lineup entry.
export async function POST(request: Request) {
  const authError = await authenticate(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400, headers: CORS_HEADERS });
  }

  const result = await findOrCreateBandByName(name);
  if (result.created) {
    console.log(`[public/bands] auto-created unreviewed band "${name}" -> slug "${result.slug}"`);
  }
  return NextResponse.json(result, { status: result.created ? 201 : 200, headers: CORS_HEADERS });
}
