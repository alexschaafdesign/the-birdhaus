#!/usr/bin/env node
// scripts/snapshot-settlements.mjs — read-only dump of per-show money totals
// for the 5 most recent shows, written to settlements-snapshot-<stamp>.json.
// Run before/after a money-path change and diff the two files.
//
// Like migrate.mjs, .env.local does NOT override an already-set DATABASE_URL,
// so the default target is the dev branch and prod is a deliberate one-off:
//   DATABASE_URL='<prod-url>' node scripts/snapshot-settlements.mjs
// Always check the host line it prints.

import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
console.log(`host: ${new URL(url).hostname}`);

const sql = postgres(url, { ssl: sslOptionFor(url), max: 1 });

try {
  const shows = await sql`
    select id, slug, title, date::text as date from shows
    order by date desc, id desc limit 5
  `;
  const snapshot = [];
  for (const show of shows) {
    const [settlement] = await sql`
      select * from settlements where show_id = ${show.id}
    `;
    const [tickets] = await sql`
      select
        count(*)::int as rows,
        coalesce(sum(quantity) filter (where status = 'completed'), 0)::int as qty_completed,
        coalesce(sum(amount_cents) filter (where status = 'completed'), 0)::int as cents_completed,
        coalesce(sum(quantity) filter (where status = 'refunded'), 0)::int as qty_refunded,
        coalesce(sum(amount_cents) filter (where status = 'refunded'), 0)::int as cents_refunded,
        count(distinct square_payment_id)::int as distinct_payments
      from ticket_purchases where show_id = ${show.id}
    `;
    snapshot.push({ show, settlement: settlement ?? null, ticket_purchases: tickets });
  }
  const out = {
    taken_at: new Date().toISOString(),
    host: new URL(url).hostname,
    shows: snapshot,
  };
  const file = `settlements-snapshot-${out.taken_at.replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${file} (${snapshot.length} shows)`);
} finally {
  await sql.end();
}
