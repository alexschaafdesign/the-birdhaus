// Pulls Twin Scene's canonical band directory and fills any currently-empty
// field (fill-only-if-empty — never overwrites a value already set in
// Birdhaus admin) on every Birdhaus band linked via twin_scene_band_id.
//
// Twin Scene used to push band data to Birdhaus (POST /api/public/bands) when
// its lineup-matcher found no match, but stopped after that flooded Birdhaus
// with thousands of bare stub bands (see cleanup-unreviewed-stub-bands.mjs).
// Twin Scene is now the canonical directory, so enrichment runs as Birdhaus
// pulling from it instead — this script is the manual/CLI form; the same
// logic backs the "Sync from Twin Scene" button in the admin bands list
// (POST /api/admin/bands/sync-twinscene), both calling
// lib/bands.ts#enrichBandsFromTwinScene.
//
// DRY-RUN BY DEFAULT — only --confirm performs the update.
//
// Usage:
//   node scripts/sync-bands-from-twinscene.mjs             (dry-run)
//   node scripts/sync-bands-from-twinscene.mjs --confirm   (writes)
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const confirm = process.argv.slice(2).includes('--confirm');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}
const baseUrl = process.env.TWIN_SCENE_API_URL;
const apiKey = process.env.TWIN_SCENE_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('TWIN_SCENE_API_URL / TWIN_SCENE_API_KEY are not set. See .env.example.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

async function fetchTwinSceneBands() {
  const res = await fetch(`${baseUrl}/api/public/bands`, { headers: { 'x-api-key': apiKey }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Twin Scene request failed (${res.status})`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : Array.isArray(body?.bands) ? body.bands : null;
  if (!Array.isArray(list)) throw new Error('Twin Scene returned an unexpected response shape');
  return list;
}

// column -> isJson. Same allowlist as lib/bands.ts's TWINSCENE_PULL_FIELDS.
const PULL_FIELDS = [
  ['bio', false],
  ['photo', false],
  ['city', false],
  ['neighborhoods', true],
  ['members', true],
  ['featured_links', true],
  ['bandcamp_embed_url', false],
  ['bandcamp_embed_height', false],
  ['genres', true],
  ['instagram', false],
  ['website', false],
];

function deriveIncomingFields(tsBand) {
  const socials = tsBand.socials && typeof tsBand.socials === 'object' ? tsBand.socials : {};
  return {
    bio: typeof tsBand.bio === 'string' ? tsBand.bio : null,
    photo: typeof tsBand.photo === 'string' ? tsBand.photo : null,
    city: typeof tsBand.city === 'string' ? tsBand.city : null,
    neighborhoods: Array.isArray(tsBand.neighborhoods) ? tsBand.neighborhoods : [],
    members: Array.isArray(tsBand.members) ? tsBand.members : [],
    featured_links: Array.isArray(tsBand.featured_links) ? tsBand.featured_links : [],
    bandcamp_embed_url: typeof tsBand.bandcamp_embed_url === 'string' ? tsBand.bandcamp_embed_url : null,
    bandcamp_embed_height: typeof tsBand.bandcamp_embed_height === 'number' ? tsBand.bandcamp_embed_height : null,
    genres:
      typeof tsBand.genre === 'string' && tsBand.genre.trim()
        ? tsBand.genre.split(',').map((g) => g.trim()).filter(Boolean)
        : [],
    instagram: typeof socials.instagram === 'string' ? socials.instagram : null,
    website: typeof socials.website === 'string' ? socials.website : null,
  };
}

try {
  console.log('Fetching Twin Scene band directory...');
  const twinSceneBands = await fetchTwinSceneBands();
  // bigint ids come back as strings over JSON on both sides — normalize to
  // Number so the Map lookup below actually matches.
  const byTwinSceneId = new Map(twinSceneBands.map((b) => [Number(b.id), b]));

  const linkedBands = await sql`select * from bands where twin_scene_band_id is not null`;
  console.log(`${linkedBands.length} Birdhaus band(s) linked to Twin Scene.\n`);

  let updated = 0;
  for (const band of linkedBands) {
    const tsBand = byTwinSceneId.get(Number(band.twin_scene_band_id));
    if (!tsBand) continue;

    const incoming = deriveIncomingFields(tsBand);
    const changes = [];
    for (const [column, isJson] of PULL_FIELDS) {
      if (!isEmptyValue(band[column])) continue;
      const value = incoming[column];
      if (isEmptyValue(value)) continue;
      changes.push({ column, value, isJson });
    }

    if (changes.length === 0) continue;

    console.log(`${band.name} (${band.slug}): ${changes.map((c) => c.column).join(', ')}`);
    updated += 1;

    if (confirm) {
      const assignments = changes.map(({ column, value, isJson }) =>
        isJson ? sql`${sql(column)} = ${sql.json(value)}` : sql`${sql(column)} = ${value}`
      );
      const setClause = assignments.reduce(
        (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
        null
      );
      await sql`update bands set ${setClause}, updated_at = now() where id = ${band.id}`;
    }
  }

  console.log(`\n${confirm ? 'Updated' : 'Would update'} ${updated} band(s).`);
  if (!confirm) console.log('Re-run with --confirm to apply.');
} finally {
  await sql.end();
}
