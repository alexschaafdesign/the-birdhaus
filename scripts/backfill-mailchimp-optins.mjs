// scripts/backfill-mailchimp-optins.mjs — one-off: re-syncs the RSVP mailing-list
// opt-ins that were collected while Mailchimp was unconfigured (the direct-to-API
// sync added in the 2026-07-13 Sheets→Postgres migration never had its env vars
// set, so every opt-in since threw and was swallowed).
//
// Reads the DISTINCT opted-in emails from the rsvps table and upserts each into
// Mailchimp — the SAME idempotent PUT (members/<md5(email)>, status_if_new=
// 'subscribed') the live /api/rsvp route uses, so re-running never duplicates and
// never re-subscribes someone who has since unsubscribed.
//
// DB connection: read from .env.prod.local, same as migrate-prod.mjs (targets
// PROD — that's where the real opt-ins are). A dev-host target aborts.
// Mailchimp credentials: pass inline (they live only in Vercel, not local env):
//
//   MAILCHIMP_API_KEY='...-us##' MAILCHIMP_AUDIENCE_ID='xxxx' \
//     node scripts/backfill-mailchimp-optins.mjs [--dry-run] [--yes]
//
// --dry-run lists who WOULD be synced and makes no external calls.
// --yes skips the confirmation prompt.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_ENV_FILE = join(ROOT, '.env.prod.local');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PROMPT = process.argv.includes('--yes');

function readDbUrl() {
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

function splitName(name) {
  const trimmed = (name || '').trim();
  const i = trimmed.indexOf(' ');
  if (i === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1) };
}

const subscriberHash = (email) =>
  crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');

const apiKey = process.env.MAILCHIMP_API_KEY;
const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
if (!DRY_RUN && (!apiKey || !audienceId)) {
  console.error('\n❌ MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID must be set (pass them inline).');
  console.error("   MAILCHIMP_API_KEY='...-us##' MAILCHIMP_AUDIENCE_ID='xxxx' node scripts/backfill-mailchimp-optins.mjs\n");
  process.exit(1);
}
const datacenter = apiKey ? apiKey.split('-').pop() : null;

const dbUrl = readDbUrl();
const dbHost = (() => { try { return new URL(dbUrl).host; } catch { return '(unparseable)'; } })();
// The Birdhaus dev branch is ep-calm-bonus-… — the real opt-ins are on prod.
if (dbHost.startsWith('ep-calm-bonus-')) {
  console.error(`\n❌ ${PROD_ENV_FILE} points at the Birdhaus DEV host (${dbHost}). This backfill targets PROD. Aborting.\n`);
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1, ssl: sslOptionFor(dbUrl) });

async function upsert(email, name) {
  const { firstName, lastName } = splitName(name);
  const res = await fetch(
    `https://${datacenter}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash(email)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        merge_fields: { FNAME: firstName, LNAME: lastName },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
}

try {
  const [{ db }] = await sql`select current_database() as db`;
  console.log(`\nDB: ${dbHost} → "${db}"`);

  // One row per distinct email (case-insensitive), keeping the most recent name.
  const people = await sql`
    select distinct on (lower(email)) email, name
    from rsvps
    where email_list_opt_in = true
    order by lower(email), created_at desc
  `;
  console.log(`Found ${people.length} distinct opted-in email(s).`);

  if (people.length === 0) {
    console.log('Nothing to sync.');
    process.exit(0);
  }
  if (DRY_RUN) {
    console.log('\n(dry run — no Mailchimp calls)\n');
    for (const p of people) console.log('  would sync:', p.email, `(${p.name})`);
    process.exit(0);
  }

  console.log(`Target audience: ${audienceId} (${datacenter})`);
  if (!SKIP_PROMPT) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`\nUpsert ${people.length} subscriber(s) to Mailchimp? Type "yes": `)).trim();
    rl.close();
    if (ans !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  let ok = 0;
  const failures = [];
  for (const p of people) {
    try {
      await upsert(p.email, p.name);
      ok++;
      process.stdout.write('.');
    } catch (err) {
      failures.push({ email: p.email, error: err.message });
      process.stdout.write('x');
    }
    // Gentle pacing — Mailchimp tolerates bursts, but there's no need to hammer it.
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n\nDone. Synced ${ok}/${people.length}.`);
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) console.log('  ', f.email, '→', f.error);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
