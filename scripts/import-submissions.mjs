// One-time import of the existing submissions spreadsheet.
// Usage:
//   npm run db:import -- path/to/export.csv             (imports into the DB)
//   npm run db:import -- path/to/export.csv --dry-run    (parses and prints only, no DB writes)
//
// Export the Google Sheet as CSV first (File > Download > Comma Separated Values),
// then run this against that file. Safe to re-run against a fresh export later —
// it always inserts new rows (it doesn't dedupe), so only run it once against a
// given export.
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { parse } from 'csv-parse/sync';
import { sslOptionFor } from './ssl-option.mjs';
import { parseAvailabilityText } from './availability-parser.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('Usage: npm run db:import -- path/to/export.csv [--dry-run]');
  process.exit(1);
}

// Maps normalized (lowercased, alphanumeric-only) header text to our column names.
const HEADER_MAP = {
  bandartist: 'band_name',
  band: 'band_name',
  contactname: 'contact_name',
  email: 'email',
  socials: 'socials',
  genrevibe: 'genre',
  genre: 'genre',
  dates: 'availability_text',
  comments: 'comments',
};

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const raw = fs.readFileSync(csvPath, 'utf8');
const records = parse(raw, { columns: true, skip_empty_lines: true });

if (records.length === 0) {
  console.log('No rows found in CSV — nothing to import.');
  process.exit(0);
}

const sourceHeaders = Object.keys(records[0]);
const columnForHeader = {};
const unmappedHeaders = [];

for (const header of sourceHeaders) {
  const mapped = HEADER_MAP[normalizeHeader(header)];
  if (mapped) columnForHeader[header] = mapped;
  else if (header.trim()) unmappedHeaders.push(header);
}

if (unmappedHeaders.length > 0) {
  console.warn(`Heads up — these columns weren't recognized and will be skipped: ${unmappedHeaders.join(', ')}`);
}

const now = new Date();
const rowsToInsert = [];
const allIssues = [];

let rowNumber = 1; // 1-based, matches spreadsheet row (header is row 1, so data starts at row 2)
for (const record of records) {
  rowNumber += 1;

  const row = { band_name: null, contact_name: null, email: null, socials: null, genre: null, availability_text: null, comments: null };
  for (const [header, column] of Object.entries(columnForHeader)) {
    row[column] = clean(record[header]);
  }
  if (!row.band_name && !row.email && !row.contact_name) continue; // skip blank spreadsheet rows
  if (!row.band_name) row.band_name = row.contact_name || row.email || 'Unknown';

  const { entries, issues } = parseAvailabilityText(row.availability_text, now);
  row.availability = entries;

  if (issues.length > 0) {
    allIssues.push({ rowNumber, bandName: row.band_name, rawText: row.availability_text, issues });
  }

  rowsToInsert.push(row);
}

function printSummary() {
  console.log(`Parsed ${rowsToInsert.length} rows.`);
  for (const row of rowsToInsert) {
    const entriesSummary = row.availability.length
      ? row.availability
          .map((e) => (e.type === 'date' ? e.value : `${e.from}..${e.to}`))
          .join(', ')
      : '(none)';
    console.log(`  - ${row.band_name}: "${row.availability_text ?? ''}" -> [${entriesSummary}]`);
  }

  if (allIssues.length > 0) {
    console.log(`\n${allIssues.length} row(s) had tokens that didn't parse cleanly — review and fix by hand after import:`);
    for (const { rowNumber, bandName, rawText, issues } of allIssues) {
      console.log(`  sheet row ${rowNumber} (${bandName}): "${rawText}"`);
      for (const issue of issues) console.log(`      - ${issue}`);
    }
  } else {
    console.log('\nNo unparseable date tokens.');
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
  for (const row of rowsToInsert) {
    await sql`
      insert into submissions (band_name, contact_name, email, socials, genre, availability_text, availability, comments, status, source)
      values (${row.band_name}, ${row.contact_name}, ${row.email}, ${row.socials}, ${row.genre}, ${row.availability_text}, ${sql.json(row.availability)}, ${row.comments}, 'new', 'import')
    `;
  }
  console.log(`Imported ${rowsToInsert.length} submissions.\n`);
  printSummary();
} finally {
  await sql.end();
}
