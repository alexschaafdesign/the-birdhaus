#!/usr/bin/env node
// scripts/staging-migrate.mjs — migrates the staging-2027 Neon branch (the copy
// of prod that next.thebirdhaus.org reads). See docs/staging.md.
//
//   node scripts/staging-migrate.mjs --expect-endpoint ep-xxxx            # dry run (default)
//   node scripts/staging-migrate.mjs --expect-endpoint ep-xxxx --apply    # apply
//   node scripts/staging-migrate.mjs --prod-migrations                    # read prod's list, nothing else
//
// The staging URL comes ONLY from .env.staging.local (DATABASE_URL=...), never
// from the shell — direnv's DATABASE_URL is dev, and a one-off prefix is how
// prod gets targeted. Guards, all hard failures before any query:
//   * the endpoint must equal --expect-endpoint (from `neon branches get staging-2027`)
//   * it must not be the dev endpoint (ep-calm-bonus-...)
//   * it must not be prod's endpoint (read from .env.prod.local's host; the
//     URL itself is never printed)
//
// Dry run: applies every pending migration in ONE transaction, prints row
// counts and what 098 flipped, then rolls the whole thing back. Apply: one
// transaction per file, recorded in schema_migrations — the same as
// scripts/migrate.mjs.
//
// --prod-migrations opens prod in a READ ONLY transaction and prints its
// schema_migrations count and last id, so a run can show prod is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

const ROOT = process.cwd();
const DEV_ENDPOINT_PREFIX = 'ep-calm-bonus-';
const COUNT_TABLES = ['shows', 'show_bands', 'bands', 'rsvps', 'settlements', 'submissions', 'ticket_purchases', 'schema_migrations'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function urlFromFile(file) {
  let text;
  try {
    text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return undefined;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return undefined;
}

// "ep-foo-bar-123-pooler.c-2.us-east-1.aws.neon.tech" → "ep-foo-bar-123"
function endpointOf(url) {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
  } catch {
    return undefined;
  }
}

function connect(url) {
  return postgres(url, { max: 1, ssl: sslOptionFor(url), onnotice: () => {} });
}

async function prodMigrations() {
  const prodUrl = urlFromFile('.env.prod.local');
  if (!prodUrl) fail('No DATABASE_URL in .env.prod.local.');
  const sql = connect(prodUrl);
  try {
    const rows = await sql.begin('read only', async (tx) => {
      return tx`select id from schema_migrations order by id`;
    });
    const ids = rows.map((r) => r.id);
    const digest = crypto.createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 12);
    console.log(`prod (${endpointOf(prodUrl)}): ${ids.length} migrations, last ${ids.at(-1)}, list sha256 ${digest}`);
  } finally {
    await sql.end();
  }
}

async function counts(sql) {
  const out = {};
  for (const table of COUNT_TABLES) {
    const [{ exists }] = await sql`select to_regclass(${'public.' + table}) is not null as exists`;
    if (!exists) {
      out[table] = '(missing)';
      continue;
    }
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from ${table}`);
    out[table] = n;
  }
  return out;
}

// 098's rule: unannounced and over by 5am America/Chicago the morning after.
async function unannouncedPast(sql) {
  return sql`
    select id, slug, date::text as date, title
    from shows
    where not announced
      and date < ((now() at time zone 'America/Chicago') - interval '5 hours')::date
    order by date
  `;
}

function printCounts(label, before, after) {
  console.log(`\n${label}`);
  for (const table of COUNT_TABLES) {
    const a = before[table];
    const b = after ? after[table] : undefined;
    console.log(`  ${table.padEnd(18)} ${String(a).padStart(7)}${after ? `  →  ${String(b).padStart(7)}` : ''}`);
  }
}

async function main() {
  if (flag('--prod-migrations')) return prodMigrations();

  const expected = option('--expect-endpoint');
  if (!expected) fail('Pass --expect-endpoint <ep-...> (from `neon branches get staging-2027`).');

  const url = urlFromFile('.env.staging.local');
  if (!url) fail('No DATABASE_URL in .env.staging.local.');
  const endpoint = endpointOf(url);
  if (!endpoint) fail('Could not parse the host in .env.staging.local.');

  const prodEndpoint = endpointOf(urlFromFile('.env.prod.local') ?? '');
  if (endpoint.startsWith(DEV_ENDPOINT_PREFIX)) fail(`${endpoint} is the DEV endpoint. Refusing.`);
  if (prodEndpoint && endpoint === prodEndpoint) fail(`${endpoint} is the PROD endpoint. Refusing.`);
  if (!prodEndpoint) fail('Could not read prod\'s endpoint from .env.prod.local, so can\'t rule it out. Refusing.');
  if (endpoint !== expected.replace(/-pooler$/, '')) fail(`Endpoint ${endpoint} is not the expected ${expected}. Refusing.`);

  const apply = flag('--apply');
  const sql = connect(url);
  try {
    const [{ db }] = await sql`select current_database() as db`;
    console.log(`staging: endpoint ${endpoint}, database "${db}" — not dev, not prod ✓`);
    console.log(apply ? 'mode: APPLY' : 'mode: dry run (rolled back)');

    const files = fs.readdirSync(path.join(ROOT, 'scripts/migrations')).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await sql`select id from schema_migrations`).map((r) => r.id));
    const pending = files.filter((f) => !applied.has(f));
    console.log(`pending (${pending.length}): ${pending.join(', ') || 'none'}`);

    const before = await counts(sql);
    const flips = await unannouncedPast(sql);

    if (!apply) {
      const ROLLBACK = Symbol('rollback');
      let after;
      let stillUnannounced;
      try {
        await sql.begin(async (tx) => {
          for (const file of pending) {
            await tx.unsafe(fs.readFileSync(path.join(ROOT, 'scripts/migrations', file), 'utf8'));
            await tx`insert into schema_migrations (id) values (${file})`;
            console.log(`  ok  ${file}`);
          }
          after = await counts(tx);
          stillUnannounced = await unannouncedPast(tx);
          throw ROLLBACK;
        });
      } catch (err) {
        if (err !== ROLLBACK) throw err;
      }
      printCounts('row counts (before → inside the rolled-back transaction):', before, after);
      console.log(`\nunannounced past shows now: ${flips.length}; after 098: ${stillUnannounced.length}`);
      for (const s of flips) console.log(`  ${s.date}  #${s.id}  ${s.slug}  ${s.title}`);
      const [{ n }] = await sql`select count(*)::int as n from schema_migrations`;
      console.log(`\nrolled back — schema_migrations still has ${n} rows (was ${before.schema_migrations}).`);
      return;
    }

    for (const file of pending) {
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync(path.join(ROOT, 'scripts/migrations', file), 'utf8'));
        await tx`insert into schema_migrations (id) values (${file})`;
      });
      console.log(`  applied ${file}`);
    }
    const after = await counts(sql);
    printCounts('row counts (before → after):', before, after);
    const ids = flips.map((s) => s.id);
    const announced = ids.length
      ? await sql`select id from shows where id in ${sql(ids)} and announced`
      : [];
    console.log(`\n098 marked ${announced.length} of ${flips.length} unannounced past shows announced:`);
    for (const s of flips) console.log(`  ${s.date}  #${s.id}  ${s.slug}  ${s.title}`);
    const left = await unannouncedPast(sql);
    console.log(`unannounced past shows left: ${left.length}`);
  } finally {
    await sql.end();
  }
}

await main();
