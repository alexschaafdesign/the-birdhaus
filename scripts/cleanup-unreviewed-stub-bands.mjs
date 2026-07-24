// One-time cleanup: the Twin Scene lineup-matcher (POST /api/public/bands)
// started auto-creating far more unreviewed stub bands than before — 1,450
// as of this writing, all created within the last ~2 days, all still fully
// blank. This deletes that batch. See conversation history for the
// investigation that led here.
//
// Usage:
//   node scripts/cleanup-unreviewed-stub-bands.mjs             (dry run — prints only)
//   node scripts/cleanup-unreviewed-stub-bands.mjs --delete    (actually deletes)
//
// Re-verifies every criterion live at run time rather than trusting an earlier
// count — a band edited or linked to a show since the investigation is
// excluded automatically. Safe to re-run: only matches the current DB state.
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const shouldDelete = process.argv.slice(2).includes('--delete');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

const CANDIDATES_QUERY = sql`
  select b.id, b.name, b.created_at
  from bands b
  where b.unreviewed = true
    and b.created_at >= now() - interval '2 days'
    and b.bio is null and b.photo is null and b.instagram is null
    and b.website is null and b.bandcamp is null
    and b.bandcamp_embed_url is null and b.bandcamp_embed_height is null
    and b.city is null and b.hometown is null
    and b.contact_email is null and b.contact_method is null
    and b.twinscene_slug is null
    and b.genres = '[]'::jsonb and b.neighborhoods = '[]'::jsonb
    and b.members = '[]'::jsonb and b.featured_links = '[]'::jsonb
    and not exists (select 1 from show_bands sb where sb.band_id = b.id)
    and not exists (select 1 from band_videos bv where bv.band_id = b.id)
  order by b.created_at asc
`;

try {
  const candidates = await CANDIDATES_QUERY;

  const outPath = path.join(process.cwd(), 'unreviewed-stub-bands.txt');
  fs.writeFileSync(
    outPath,
    candidates.map((b) => `${b.id}\t${b.created_at.toISOString()}\t${b.name}`).join('\n') + '\n'
  );

  if (!shouldDelete) {
    console.log(`Would delete ${candidates.length} band(s). Full list written to ${outPath}`);
    console.log('Re-run with --delete to actually delete them.');
  } else {
    const ids = candidates.map((b) => b.id);
    const deleted = await sql`delete from bands where id in ${sql(ids)} returning id, name`;
    console.log(`Deleted ${deleted.length} band(s). Full list was written to ${outPath}`);
  }
} finally {
  await sql.end();
}
