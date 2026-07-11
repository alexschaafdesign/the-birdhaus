// One-time import of the existing content/shows/*.md files into the shows table.
// Usage:
//   node scripts/import-shows.mjs             (imports into the DB)
//   node scripts/import-shows.mjs --dry-run   (parses and prints only, no DB writes)
//
// Safe to re-run: inserts use `on conflict (slug) do nothing`, so already-imported
// shows are skipped rather than duplicated.
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import matter from 'gray-matter';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const showsDir = path.join(process.cwd(), 'content/shows');
const files = fs.readdirSync(showsDir).filter((f) => f.endsWith('.md')).sort();

if (files.length === 0) {
  console.log('No show files found in content/shows — nothing to import.');
  process.exit(0);
}

function normalizePhotographer(value) {
  if (!value) return null;
  if (typeof value === 'string') return { name: value };
  if (typeof value === 'object' && typeof value.name === 'string') {
    return { name: value.name, ...(value.instagram ? { instagram: value.instagram } : {}) };
  }
  return null;
}

const rows = files.map((file) => {
  const slug = file.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(showsDir, file), 'utf8');
  const { data, content } = matter(raw);

  return {
    slug,
    title: data.title,
    date: data.date,
    doors_time: data.doorsTime ?? null,
    show_time: data.showTime ?? null,
    flyer: data.flyer ?? null,
    bands: data.bands || [],
    description: data.description ?? null,
    photographer: normalizePhotographer(data.photographer),
    rsvp_url: data.rsvpUrl ?? null,
    ticket_url: data.ticketUrl ?? null,
    external_ticket_url: data.externalTicketUrl ?? null,
    rsvp_form: data.rsvpForm ?? true,
    videos: data.videos || [],
    audio: data.audio || [],
    photos: data.photos || [],
    photo_folder: data.photoFolder ?? null,
    photo_credit: data.photoCredit ?? null,
    content_markdown: content,
    announced: data.announced ?? false,
  };
});

function printSummary() {
  console.log(`Parsed ${rows.length} show file(s).`);
  for (const row of rows) {
    const bandCount = Array.isArray(row.bands) ? row.bands.length : 0;
    console.log(`  - ${row.date} ${row.slug}: "${row.title}" (${bandCount} band(s))`);
  }
}

if (dryRun) {
  printSummary();
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

try {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const [inserted] = await sql`
      insert into shows (
        slug, title, date, doors_time, show_time, flyer, bands, description,
        photographer, rsvp_url, ticket_url, external_ticket_url, rsvp_form,
        videos, audio, photos, photo_folder, photo_credit, content_markdown, announced
      )
      values (
        ${row.slug}, ${row.title}, ${row.date}, ${row.doors_time}, ${row.show_time}, ${row.flyer}, ${sql.json(row.bands)}, ${row.description},
        ${sql.json(row.photographer)}, ${row.rsvp_url}, ${row.ticket_url}, ${row.external_ticket_url}, ${row.rsvp_form},
        ${sql.json(row.videos)}, ${sql.json(row.audio)}, ${sql.json(row.photos)}, ${row.photo_folder}, ${row.photo_credit}, ${row.content_markdown}, ${row.announced}
      )
      on conflict (slug) do nothing
      returning slug
    `;
    if (inserted) {
      imported += 1;
      console.log(`imported ${row.slug}`);
    } else {
      skipped += 1;
      console.log(`skipped  ${row.slug} (already exists)`);
    }
  }

  console.log(`\nDone. Imported ${imported}, skipped ${skipped} (already existed).`);
} finally {
  await sql.end();
}
