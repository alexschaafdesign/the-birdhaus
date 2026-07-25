#!/usr/bin/env node
// scripts/test-square-sync.mjs — isolated test of lib/square's syncShowToSquare
// against ONE real show row. Forces SQUARE_SYNC_ENABLED=true for this process
// only (never persisted). Reads the show from Postgres (read-only SELECT) and
// does NOT write anything back to Postgres — it only exercises the Square calls.
// Re-runnable safely: syncShowToSquare uses stable idempotency keys.
//
// Usage: node scripts/test-square-sync.mjs <showId>
process.loadEnvFile('.env.local');
process.env.SQUARE_SYNC_ENABLED = 'true';

import postgres from 'postgres';
import { syncShowToSquare } from '../lib/square.ts';
import { sslOptionFor } from './ssl-option.mjs';

const showId = process.argv[2];
if (!showId) {
  console.error('Usage: node scripts/test-square-sync.mjs <showId>');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: sslOptionFor(process.env.DATABASE_URL) });

try {
  const [show] = await sql`
    select id, title, date::text as date, doors_time, show_time, flyer
    from shows
    where id = ${showId}
  `;
  if (!show) {
    console.error(`No show found with id ${showId}`);
    process.exit(1);
  }
  console.log('Show:', show);
  const result = await syncShowToSquare(show);
  console.log('\nsyncShowToSquare result:');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
