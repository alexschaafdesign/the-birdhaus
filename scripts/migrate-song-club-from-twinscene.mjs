// scripts/migrate-song-club-from-twinscene.mjs — one-off: copies Song Club data
// (song_club_events + song_club_rsvps) FROM Twin Scene's database INTO Birdhaus's
// database. Run once, at ship time, after migration 040 has created the tables
// on Birdhaus prod. Idempotent: an event already present in the target (matched
// by slug) is skipped, so re-running never duplicates.
//
// The two repos use SEPARATE databases (see ../twinscene/ARCHITECTURE.md), so
// this is a genuine cross-DB copy. IDs are reassigned by the target's bigserial;
// RSVPs are re-pointed at the new event id. created_at / updated_at /
// confirmation_email_sent_at are preserved. flyer_url is left as-is — it points
// at Twin Scene's public R2 bucket, which keeps serving the image regardless of
// which site renders it.
//
// SOURCE (Twin Scene) connection string: pass via TWINSCENE_DATABASE_URL. Get it
// from twinscene/.env.prod.local (its prod DATABASE_URL). Never commit or echo it.
//   TWINSCENE_DATABASE_URL='<twin scene prod url>' node scripts/migrate-song-club-from-twinscene.mjs
//
// TARGET (Birdhaus) connection string: read from .env.prod.local, same as
// migrate-prod.mjs. Add --yes to skip the confirmation prompt; --dry-run to
// preview without writing.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_ENV_FILE = join(ROOT, '.env.prod.local');
const DRY_RUN = process.argv.includes('--dry-run');

function readTargetUrl() {
  let text;
  try {
    text = readFileSync(PROD_ENV_FILE, 'utf8');
  } catch {
    console.error(`\n❌ ${PROD_ENV_FILE} not found. See scripts/migrate-prod.mjs for one-time setup.\n`);
    process.exit(1);
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  console.error(`\n❌ No DATABASE_URL line found in ${PROD_ENV_FILE}.\n`);
  process.exit(1);
}

const targetUrl = readTargetUrl();
const sourceUrl = process.env.TWINSCENE_DATABASE_URL;
if (!sourceUrl) {
  console.error('\n❌ TWINSCENE_DATABASE_URL is not set (the SOURCE — Twin Scene\'s database).');
  console.error('   Get it from twinscene/.env.prod.local and pass it inline:');
  console.error("   TWINSCENE_DATABASE_URL='<twin scene prod url>' node scripts/migrate-song-club-from-twinscene.mjs\n");
  process.exit(1);
}

const targetHost = (() => { try { return new URL(targetUrl).host; } catch { return '(unparseable)'; } })();
const sourceHost = (() => { try { return new URL(sourceUrl).host; } catch { return '(unparseable)'; } })();

// Guard: the Birdhaus dev branch is ep-calm-bonus-… — if the target points there,
// this isn't prod. (The source is Twin Scene's, a different DB entirely.)
if (targetHost.startsWith('ep-calm-bonus-')) {
  console.error(`\n❌ Target ${PROD_ENV_FILE} points at the Birdhaus DEV host (${targetHost}). Aborting.\n`);
  process.exit(1);
}

const source = postgres(sourceUrl, { max: 1, ssl: sslOptionFor(sourceUrl) });
const target = postgres(targetUrl, { max: 1, ssl: sslOptionFor(targetUrl) });

try {
  const [srcInfo] = await source`select current_database() as db`;
  const [tgtInfo] = await target`select current_database() as db`;
  console.log(`\nSOURCE (Twin Scene): ${sourceHost} → "${srcInfo.db}"`);
  console.log(`TARGET (Birdhaus):   ${targetHost} → "${tgtInfo.db}"`);
  if (DRY_RUN) console.log('\n(dry run — no writes)');

  const events = await source`
    select id, slug, title, event_date::text as event_date, start_time, end_time,
           venue_name, address, arrival_notes, description, flyer_url, published,
           created_at, updated_at
    from song_club_events
    order by id
  `;
  const rsvps = await source`
    select id, event_id, name, email, guests, confirmation_email_sent_at, created_at
    from song_club_rsvps
    order by id
  `;
  console.log(`\nFound in source: ${events.length} event(s), ${rsvps.length} RSVP(s).`);

  if (events.length === 0) {
    console.log('Nothing to copy.');
    process.exit(0);
  }

  if (!DRY_RUN && !process.argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('\nCopy these into the Birdhaus (TARGET) database above? Type "yes": ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  let copiedEvents = 0;
  let copiedRsvps = 0;
  let skippedEvents = 0;

  for (const e of events) {
    const eventRsvps = rsvps.filter((r) => r.event_id === e.id);

    if (DRY_RUN) {
      console.log(`  would copy "${e.title}" (${e.slug}) + ${eventRsvps.length} RSVP(s)`);
      continue;
    }

    await target.begin(async (tx) => {
      const existing = await tx`select id from song_club_events where slug = ${e.slug} limit 1`;
      if (existing.length > 0) {
        console.log(`  skip   "${e.title}" (${e.slug}) — already in target`);
        skippedEvents++;
        return;
      }

      const [inserted] = await tx`
        insert into song_club_events
          (slug, title, event_date, start_time, end_time, venue_name, address,
           arrival_notes, description, flyer_url, published, created_at, updated_at)
        values
          (${e.slug}, ${e.title}, ${e.event_date}, ${e.start_time}, ${e.end_time},
           ${e.venue_name}, ${e.address}, ${e.arrival_notes}, ${e.description},
           ${e.flyer_url}, ${e.published}, ${e.created_at}, ${e.updated_at})
        returning id
      `;
      copiedEvents++;

      for (const r of eventRsvps) {
        await tx`
          insert into song_club_rsvps
            (event_id, name, email, guests, confirmation_email_sent_at, created_at)
          values
            (${inserted.id}, ${r.name}, ${r.email}, ${r.guests},
             ${r.confirmation_email_sent_at}, ${r.created_at})
        `;
        copiedRsvps++;
      }
      console.log(`  copied "${e.title}" (${e.slug}) + ${eventRsvps.length} RSVP(s)`);
    });
  }

  if (!DRY_RUN) {
    console.log(`\nDone. Copied ${copiedEvents} event(s), ${copiedRsvps} RSVP(s); skipped ${skippedEvents} existing event(s).`);
  }
} finally {
  await source.end();
  await target.end();
}
