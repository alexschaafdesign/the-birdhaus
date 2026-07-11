// One-time backfill: scans every show's `bands` jsonb array, dedupes by
// case-insensitive trimmed name, creates one row in `bands` per unique band
// (reusing an existing row if one already matches by name), and back-fills a
// `bandId` into each show's band entries.
//
// Usage:
//   node scripts/backfill-bands.mjs             (writes to the DB)
//   node scripts/backfill-bands.mjs --dry-run   (prints a summary only)
//
// Safe to re-run: entries that already have a bandId are left untouched, and
// band names that already match an existing `bands` row are reused (never
// overwriting that row's instagram/bio) rather than duplicated.
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

try {
  const shows = await sql`select id, bands from shows order by date asc`;

  // key (lowercased, trimmed name) -> { canonicalName, instagram, bio }
  const uniqueBands = new Map();

  for (const show of shows) {
    for (const raw of show.bands ?? []) {
      const entry = typeof raw === 'string' ? { name: raw } : raw;
      if (!entry?.name) continue;
      const name = entry.name.trim();
      const key = name.toLowerCase();
      if (!key) continue;

      const existing = uniqueBands.get(key);
      if (!existing) {
        uniqueBands.set(key, {
          canonicalName: name,
          instagram: entry.instagram || null,
          bio: entry.bio || null,
        });
        continue;
      }
      if (!existing.instagram && entry.instagram) existing.instagram = entry.instagram;
      if (entry.bio && (!existing.bio || entry.bio.length > existing.bio.length)) {
        existing.bio = entry.bio;
      }
    }
  }

  console.log(`Found ${uniqueBands.size} unique band name(s) across ${shows.length} show(s).`);

  // key -> bandId, populated as we reuse/create rows below.
  const bandIdByKey = new Map();
  let created = 0;
  let reused = 0;

  async function resolveBands(db) {
    for (const [key, band] of uniqueBands) {
      const [existingRow] = await db`select id from bands where lower(name) = ${key} limit 1`;
      if (existingRow) {
        bandIdByKey.set(key, existingRow.id);
        reused += 1;
        continue;
      }

      if (dryRun) {
        created += 1;
        bandIdByKey.set(key, -1); // placeholder so the entry-backfill count below is accurate
        continue;
      }

      let slugBase = slugify(band.canonicalName) || 'band';
      let slug = slugBase;
      let suffix = 2;
      while ((await db`select 1 from bands where slug = ${slug} limit 1`).length > 0) {
        slug = `${slugBase}-${suffix}`;
        suffix += 1;
      }

      const [row] = await db`
        insert into bands (slug, name, instagram, bio)
        values (${slug}, ${band.canonicalName}, ${band.instagram}, ${band.bio})
        returning id
      `;
      bandIdByKey.set(key, row.id);
      created += 1;
    }
  }

  let showsUpdated = 0;
  let entriesBackfilled = 0;

  async function backfillShowEntries(db) {
    for (const show of shows) {
      let changed = false;
      const nextBands = (show.bands ?? []).map((raw) => {
        const entry = typeof raw === 'string' ? { name: raw } : raw;
        if (!entry?.name || entry.bandId) return entry;
        const bandId = bandIdByKey.get(entry.name.trim().toLowerCase());
        if (!bandId) return entry;
        changed = true;
        entriesBackfilled += 1;
        return { ...entry, bandId };
      });

      if (changed) {
        showsUpdated += 1;
        if (!dryRun) {
          await db`update shows set bands = ${db.json(nextBands)} where id = ${show.id}`;
        }
      }
    }
  }

  if (dryRun) {
    await resolveBands(sql);
    await backfillShowEntries(sql);
    console.log(`Would create ${created} new band(s), reuse ${reused} existing band(s).`);
    console.log(`Would backfill ${entriesBackfilled} show band entrie(s) across ${showsUpdated} show(s).`);
  } else {
    await sql.begin(async (tx) => {
      await resolveBands(tx);
      await backfillShowEntries(tx);
    });
    console.log(`Created ${created} new band(s), reused ${reused} existing band(s).`);
    console.log(`Backfilled ${entriesBackfilled} show band entrie(s) across ${showsUpdated} show(s).`);
  }
} finally {
  await sql.end();
}
