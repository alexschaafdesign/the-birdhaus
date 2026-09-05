// One-time backfill: seed ticket_purchases from Square's payments API for every
// show that has show_square_links rows, so the admin sales pills are accurate
// from day one (the webhook only records purchases from when it goes live).
//
// For each show: scan COMPLETED Square payments in the same window the RSVP
// reconciliation uses (earliest link created_at → show date + 3 days), retrieve
// their orders, and keep payments whose order line items match the show's
// catalog variation ids — capturing the line-item quantity, which the app's
// getShowPurchases discards.
//
// Rows are inserted with source='backfill' AND a pre-stamped
// confirmation_email_sent_at, both of which the webhook's email claim excludes —
// backfilled buyers can never be retro-emailed. `on conflict (square_payment_id)
// do nothing` makes re-runs (and overlap with webhook-written rows) idempotent.
//
// Square calls here are READ-ONLY, so SQUARE_SYNC_ENABLED is not required —
// only SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID.
//
// Usage (per docs/db-safety.md — dev DB by default, run whichdb first):
//   node scripts/backfill-ticket-purchases.mjs            (dry run — prints what it WOULD insert)
//   node scripts/backfill-ticket-purchases.mjs --apply    (actually writes)
//   DATABASE_URL='<prod-url>' node scripts/backfill-ticket-purchases.mjs --apply   (prod, one-off)
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const apply = process.argv.slice(2).includes('--apply');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const token = process.env.SQUARE_ACCESS_TOKEN;
const locationId = process.env.SQUARE_LOCATION_ID;
if (!token || !locationId) {
  console.error('SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID must be set.');
  process.exit(1);
}

const SQUARE_VERSION = '2026-07-15';
const SQUARE_BASE = 'https://connect.squareup.com';
const authHeaders = { 'Square-Version': SQUARE_VERSION, Authorization: `Bearer ${token}` };

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

// COMPLETED payments in [since, until] → { paymentId, orderId, email, amountCents, createdAt }.
async function listCompletedPayments(since, until) {
  const payments = [];
  let cursor;
  do {
    const url = new URL(`${SQUARE_BASE}/v2/payments`);
    url.searchParams.set('location_id', locationId);
    url.searchParams.set('begin_time', since.toISOString());
    url.searchParams.set('end_time', until.toISOString());
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error(`list payments failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const p of data.payments ?? []) {
      if (p.status === 'COMPLETED' && p.order_id && p.id) {
        payments.push({
          paymentId: p.id,
          orderId: p.order_id,
          email: p.buyer_email_address ?? null,
          amountCents: p.amount_money?.amount ?? 0,
          createdAt: p.created_at ?? null,
        });
      }
    }
    cursor = data.cursor;
  } while (cursor);
  return payments;
}

// order id → first matching line item { variationId, quantity } (for `wanted` variation ids).
async function matchOrders(orderIds, wanted) {
  const matched = new Map();
  for (let i = 0; i < orderIds.length; i += 100) {
    const res = await fetch(`${SQUARE_BASE}/v2/orders/batch-retrieve`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: locationId, order_ids: orderIds.slice(i, i + 100) }),
    });
    if (!res.ok) throw new Error(`batch-retrieve orders failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const o of data.orders ?? []) {
      for (const li of o.line_items ?? []) {
        if (li.catalog_object_id && wanted.has(li.catalog_object_id)) {
          matched.set(o.id, {
            variationId: li.catalog_object_id,
            quantity: Math.max(1, Math.trunc(Number(li.quantity)) || 1),
          });
          break;
        }
      }
    }
  }
  return matched;
}

try {
  const [{ current_database }] = await sql`select current_database() as current_database`;
  const url = new URL(connectionString);
  console.log(`DB: ${current_database} @ ${url.host}`);
  console.log(apply ? '\n*** APPLYING WRITES ***\n' : '\n(dry run — pass --apply to write)\n');

  // Every show that was ever synced to Square, with its variation ids and the
  // same scan window the app's reconciliation uses.
  const shows = await sql`
    select s.id, s.title, s.date::text as date,
      array_agg(l.square_variation_id) filter (where l.square_variation_id is not null) as variation_ids,
      min(l.created_at) as earliest_link_at
    from shows s
    join show_square_links l on l.show_id = s.id
    group by s.id, s.title, s.date
    order by s.date
  `;
  console.log(`Shows with Square links: ${shows.length}\n`);

  let totalInserted = 0;
  let totalMatched = 0;
  for (const show of shows) {
    const variationIds = show.variation_ids ?? [];
    if (variationIds.length === 0) continue;
    const wanted = new Set(variationIds);

    const showMidnight = new Date(`${show.date}T00:00:00`);
    const since = show.earliest_link_at
      ? new Date(show.earliest_link_at)
      : new Date(showMidnight.getTime() - 120 * 86_400_000);
    const until = new Date(showMidnight.getTime() + 3 * 86_400_000);

    const payments = await listCompletedPayments(since, until);
    const orderIds = [...new Set(payments.map((p) => p.orderId))];
    const matched = await matchOrders(orderIds, wanted);
    const purchases = payments.filter((p) => matched.has(p.orderId));
    totalMatched += purchases.length;

    const revenue = purchases.reduce((sum, p) => sum + p.amountCents, 0);
    console.log(
      `#${show.id} ${show.date} "${show.title}": ${purchases.length} purchase(s), $${(revenue / 100).toFixed(2)}`,
    );

    if (!apply || purchases.length === 0) continue;

    for (const p of purchases) {
      const line = matched.get(p.orderId);
      const inserted = await sql`
        insert into ticket_purchases (
          show_id, square_payment_id, square_order_id, square_variation_id,
          amount_cents, quantity, buyer_email, payment_created_at,
          source, confirmation_email_sent_at
        ) values (
          ${show.id}, ${p.paymentId}, ${p.orderId}, ${line.variationId},
          ${p.amountCents}, ${line.quantity}, ${p.email}, ${p.createdAt},
          'backfill', now()
        )
        on conflict (square_payment_id, square_variation_id) do nothing
        returning id
      `;
      totalInserted += inserted.length;
    }
  }

  console.log(`\nMatched purchases across all shows: ${totalMatched}`);
  if (apply) {
    console.log(`Rows inserted (skips = already present): ${totalInserted}`);
    const [{ n }] = await sql`select count(*)::int as n from ticket_purchases`;
    console.log(`ticket_purchases now holds ${n} row(s).`);
  } else {
    console.log('Dry run complete. No changes made.');
  }
} finally {
  await sql.end();
}
