#!/usr/bin/env node
// One-off (2026-11): delete bands that have never been on a Birdhaus show.
// Almost all of them were bulk-imported from Twin Scene's directory on
// 2026-07-11, back when Birdhaus mirrored it. Birdhaus's bands table is now
// Birdhaus-only (see lib/twinscene.ts). This deletes Birdhaus rows only:
// Twin Scene is a separate database and is never touched.
//
// A band is deleted only when NOTHING refers to it: no show_bands row, no
// band_videos, advance_recipients/messages, show_input_items,
// booking_prospects or release_links row, and no bandId in any shows.bands
// JSON. A band with a payout handle (payment_method) is kept, since only
// Birdhaus sets that.
//
// Usage (targets whatever DATABASE_URL the shell holds, else .env.local = DEV):
//   node scripts/prune-unplayed-bands.mjs                 dry run: prints the list
//   node scripts/prune-unplayed-bands.mjs --apply --expect=252
// --expect must equal the dry run's count, so a list that changed between the
// dry run and the apply aborts instead of deleting something unreviewed.
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // fine: DATABASE_URL may come from the shell
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const expectArg = process.argv.find((a) => a.startsWith('--expect='));
const expected = expectArg ? Number(expectArg.split('=')[1]) : null;
if (apply && !Number.isInteger(expected)) {
  console.error('--apply needs --expect=<count from the dry run>.');
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: sslOptionFor(url) });

// The single source of the "nothing refers to it" rule, used by both the
// listing and the delete so they can't disagree.
const unreferenced = sql`
  not exists (select 1 from show_bands x where x.band_id = b.id)
  and not exists (select 1 from band_videos x where x.band_id = b.id)
  and not exists (select 1 from advance_recipients x where x.band_id = b.id)
  and not exists (select 1 from advance_messages x where x.band_id = b.id)
  and not exists (select 1 from show_input_items x where x.band_id = b.id)
  and not exists (select 1 from booking_prospects x where x.band_id = b.id)
  and not exists (select 1 from release_links x where x.band_id = b.id)
  and not exists (
    select 1 from shows s, jsonb_array_elements(s.bands) e
    where jsonb_typeof(s.bands) = 'array' and e ? 'bandId' and (e->>'bandId') = b.id::text
  )
  and nullif(trim(coalesce(b.payment_method, '')), '') is null
`;

try {
  const [{ db }] = await sql`select current_database() as db`;
  console.log(`Target: ${new URL(url).host} / ${db}`);
  console.log(apply ? 'Mode: APPLY (deletes rows)\n' : 'Mode: dry run (no changes)\n');

  const candidates = await sql`
    select b.id, b.name, b.created_at::date as created,
      nullif(trim(coalesce(b.contact_email, '')), '') is not null as has_email
    from bands b
    where ${unreferenced}
    order by b.created_at, b.name
  `;
  const [{ total }] = await sql`select count(*)::int as total from bands`;

  for (const c of candidates) {
    const created = c.created.toISOString().slice(0, 10);
    console.log(`  ${String(c.id).padStart(5)}  ${created}  ${c.has_email ? '[email] ' : ''}${c.name}`);
  }
  console.log(`\n${candidates.length} of ${total} bands would be deleted; ${total - candidates.length} kept.`);

  if (!apply) {
    console.log(`\nTo delete them: node scripts/prune-unplayed-bands.mjs --apply --expect=${candidates.length}`);
  } else {
    if (candidates.length !== expected) {
      throw new Error(`Expected ${expected} bands but found ${candidates.length}. Nothing deleted; re-run the dry run.`);
    }
    const ids = candidates.map((c) => c.id);
    const deleted = await sql.begin(async (tx) => {
      const rows = await tx`
        delete from bands b
        where b.id in ${tx(ids)} and ${unreferenced}
        returning b.id
      `;
      if (rows.length !== expected) {
        throw new Error(`Delete matched ${rows.length}, expected ${expected}. Rolled back.`);
      }
      return rows.length;
    });
    const [{ left }] = await sql`select count(*)::int as left from bands`;
    console.log(`\nDeleted ${deleted}. ${left} bands remain.`);
  }
} finally {
  await sql.end();
}
