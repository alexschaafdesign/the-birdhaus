// One-time backfill: bands.id is bigserial, and the postgres driver has always
// serialized bigint columns as strings over JSON — so resolveShowBandEntries()
// (lib/bands.ts) has been storing e.g. "bandId": "93" instead of 93 in every
// show's bands/videos jsonb ever since bandId linking existed. That silently broke
// bandId-keyed lookups (band profile bio/photo fallback, /bands/[slug] links) and,
// once isValidBandsInput's strict number check landed, blocked re-saving any show
// that already had a linked band. This coerces every stored bandId back to a number.
//
// Usage:
//   node scripts/backfill-band-id-types.mjs             (writes to the DB)
//   node scripts/backfill-band-id-types.mjs --dry-run   (prints a summary only)
//
// Safe to re-run: only rows with an actual string->number change get updated.
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const dryRun = process.argv.slice(2).includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

function coerceBandId(value) {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

// Returns [nextArray, changed] — nextArray is the input untouched if nothing changed.
function normalize(arr) {
  let changed = false;
  const next = (arr ?? []).map((raw) => {
    if (!raw || typeof raw !== 'object' || !('bandId' in raw)) return raw;
    const normalized = coerceBandId(raw.bandId);
    if (normalized === raw.bandId) return raw;
    changed = true;
    return { ...raw, bandId: normalized };
  });
  return [changed ? next : arr, changed];
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

try {
  const shows = await sql`select id, bands, videos from shows order by id asc`;

  let bandsFixed = 0;
  let videosFixed = 0;
  let showsUpdated = 0;

  async function run(db) {
    for (const show of shows) {
      const [nextBands, bandsChanged] = normalize(show.bands);
      const [nextVideos, videosChanged] = normalize(show.videos);
      if (!bandsChanged && !videosChanged) continue;

      showsUpdated += 1;
      if (bandsChanged) bandsFixed += 1;
      if (videosChanged) videosFixed += 1;

      if (!dryRun) {
        await db`
          update shows
          set bands = ${db.json(nextBands)}, videos = ${db.json(nextVideos)}
          where id = ${show.id}
        `;
      }
    }
  }

  if (dryRun) {
    await run(sql);
    console.log(`Would fix bands on ${bandsFixed} show(s), videos on ${videosFixed} show(s).`);
    console.log(`Would update ${showsUpdated} of ${shows.length} show(s) total.`);
  } else {
    await sql.begin((tx) => run(tx));
    console.log(`Fixed bands on ${bandsFixed} show(s), videos on ${videosFixed} show(s).`);
    console.log(`Updated ${showsUpdated} of ${shows.length} show(s) total.`);
  }
} finally {
  await sql.end();
}
