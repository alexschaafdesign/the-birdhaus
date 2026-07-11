// One-time import: pulls the Twin Scene band directory (a public Google
// Sheet, soon to be retired) into Birdhaus's bands table, which becomes the
// shared source of truth for band profile data across both projects.
//
// Usage:
//   node scripts/import-twinscene-bands.mjs             (writes to the DB)
//   node scripts/import-twinscene-bands.mjs --dry-run   (fetches + prints a summary, no DB writes)
//
// Safe to re-run: matches existing bands first by twinscene_slug (set on a
// prior run), falling back to case-insensitive name match. Existing field
// values are never overwritten — only currently-empty fields get filled in.
import path from 'path';
import postgres from 'postgres';
import { parse } from 'csv-parse/sync';
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

// Same "gviz" live CSV export twinscene's own lib/fetchBands.ts reads —
// reflects the live sheet almost immediately, unlike the cached "publish to
// web" export. The sheet is shared "anyone with the link can view".
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=0&headers=1';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Reduce a full URL or "@handle" to just the bare Instagram handle.
function cleanInstagramHandle(value) {
  let s = (value ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/^instagram\.com\//i, '');
  s = s.replace(/^@/, '');
  return s.split(/[/?#]/)[0];
}

function splitList(value) {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseFeaturedLinks(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l === 'object')
      .map((l) => ({
        url: typeof l.url === 'string' ? l.url : '',
        label: typeof l.label === 'string' ? l.label : '',
        image: typeof l.image === 'string' ? l.image : '',
      }))
      .filter((l) => l.url);
  } catch {
    return [];
  }
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

async function uniqueSlug(db, base) {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await db`select 1 from bands where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// Field -> DB column, for the fill-only-if-empty merge on an existing match.
const MERGE_FIELDS = [
  ['bio', 'bio'],
  ['photo', 'photo'],
  ['instagram', 'instagram'],
  ['genres', 'genres'],
  ['city', 'city'],
  ['neighborhoods', 'neighborhoods'],
  ['members', 'members'],
  ['contactEmail', 'contact_email'],
  ['contactMethod', 'contact_method'],
  ['website', 'website'],
  ['bandcamp', 'bandcamp'],
  ['bandcampEmbedUrl', 'bandcamp_embed_url'],
  ['bandcampEmbedHeight', 'bandcamp_embed_height'],
  ['featuredLinks', 'featured_links'],
];
const JSON_FIELDS = new Set(['genres', 'neighborhoods', 'members', 'featuredLinks']);

try {
  console.log('Fetching Twin Scene band directory...');
  const res = await fetch(`${CSV_URL}&t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Failed to fetch the sheet (${res.status})`);
    process.exit(1);
  }
  const text = await res.text();
  const records = parse(text, {
    columns: (header) => header.map((h) => h.trim().toUpperCase()),
    skip_empty_lines: true,
  });

  const parsedBands = [];
  let skipped = 0;

  for (const record of records) {
    const name = (record.NAME ?? '').trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const embedHeightRaw = parseInt(record['BANDCAMP EMBED HEIGHT'], 10);
    const instagramHandle = cleanInstagramHandle(record.INSTAGRAM);

    parsedBands.push({
      name,
      twinsceneSlug: (record.SLUG ?? '').trim() || slugify(name),
      genres: splitList(record.GENRES),
      city: (record.LOCATION ?? '').trim() || null,
      neighborhoods: splitList(record.NEIGHBORHOODS),
      members: splitList(record.MEMBERS),
      contactEmail: (record.CONTACT_EMAIL ?? '').trim() || null,
      contactMethod: (record.CONTACT_METHOD ?? '').trim() || null,
      bio: (record.BIO ?? '').trim() || null,
      photo: (record.IMAGE ?? '').trim() || null,
      website: (record.WEBSITE ?? '').trim() || null,
      instagram: instagramHandle ? `https://www.instagram.com/${instagramHandle}` : null,
      bandcamp: (record.BANDCAMP ?? '').trim() || null,
      bandcampEmbedUrl: (record['BANDCAMP EMBED URL'] ?? '').trim() || null,
      bandcampEmbedHeight: Number.isNaN(embedHeightRaw) ? null : embedHeightRaw,
      featuredLinks: parseFeaturedLinks(record.FEATURED_LINKS),
    });
  }

  console.log(`Parsed ${parsedBands.length} band(s) from the sheet (${skipped} blank row(s) skipped).`);

  let created = 0;
  let enriched = 0;
  let untouched = 0;
  const enrichedFields = new Map(); // name -> fields filled in, for the summary

  async function run(db) {
    for (const band of parsedBands) {
      const [bySlug] =
        await db`select * from bands where twinscene_slug = ${band.twinsceneSlug} limit 1`;
      const matched =
        bySlug ?? (await db`select * from bands where lower(name) = lower(${band.name}) limit 1`)[0];

      if (matched) {
        const assignments = [];
        const filled = [];

        for (const [field, column] of MERGE_FIELDS) {
          if (!isEmpty(matched[column])) continue;
          const incoming = band[field];
          if (isEmpty(incoming)) continue;
          filled.push(field);
          assignments.push(
            JSON_FIELDS.has(field)
              ? db`${db(column)} = ${db.json(incoming)}`
              : db`${db(column)} = ${incoming}`
          );
        }

        if (!matched.twinscene_slug) {
          assignments.push(db`twinscene_slug = ${band.twinsceneSlug}`);
        }

        if (assignments.length > 0) {
          if (!dryRun) {
            const setClause = assignments.reduce(
              (acc, fragment) => (acc === null ? fragment : db`${acc}, ${fragment}`),
              null
            );
            await db`update bands set ${setClause}, updated_at = now() where id = ${matched.id}`;
          }
          if (filled.length > 0) {
            enriched += 1;
            enrichedFields.set(band.name, filled);
          } else {
            untouched += 1; // only twinscene_slug got backfilled, no real enrichment
          }
        } else {
          untouched += 1;
        }
        continue;
      }

      created += 1;
      if (dryRun) continue;

      const slug = await uniqueSlug(db, slugify(band.name) || 'band');
      await db`
        insert into bands (
          slug, name, instagram, bio, photo, genres, city, neighborhoods, members,
          contact_email, contact_method, website, bandcamp, bandcamp_embed_url,
          bandcamp_embed_height, featured_links, twinscene_slug
        )
        values (
          ${slug}, ${band.name}, ${band.instagram}, ${band.bio}, ${band.photo},
          ${db.json(band.genres)}, ${band.city}, ${db.json(band.neighborhoods)}, ${db.json(band.members)},
          ${band.contactEmail}, ${band.contactMethod}, ${band.website}, ${band.bandcamp}, ${band.bandcampEmbedUrl},
          ${band.bandcampEmbedHeight}, ${db.json(band.featuredLinks)}, ${band.twinsceneSlug}
        )
      `;
    }
  }

  if (dryRun) {
    await run(sql);
  } else {
    await sql.begin(async (tx) => {
      await run(tx);
    });
  }

  console.log(
    `\n${dryRun ? 'Would create' : 'Created'} ${created} new band(s), ${
      dryRun ? 'would enrich' : 'enriched'
    } ${enriched} existing band(s), ${untouched} already had everything (or were already fully synced).`
  );
  if (enrichedFields.size > 0) {
    console.log('\nEnriched bands (fields filled in):');
    for (const [name, fields] of enrichedFields) {
      console.log(`  - ${name}: ${fields.join(', ')}`);
    }
  }
} finally {
  await sql.end();
}
