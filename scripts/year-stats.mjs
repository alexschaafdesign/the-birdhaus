#!/usr/bin/env node
// scripts/year-stats.mjs — read-only year-in-review stats for a calendar year.
// Shows, bands, sets, ticket revenue (Square) and the venue's own settlement
// accounting (total income + total paid to bands), reusing the exact settlement
// math from lib/settlements.ts so the money numbers match the admin summary.
//
// Read-only (SELECT only). Like migrate.mjs, .env.local does NOT override an
// already-set DATABASE_URL, so the default target is the dev branch and prod is
// a deliberate one-off:
//   DATABASE_URL='<prod-url>' node scripts/year-stats.mjs 2026
// Always check the host line it prints.

import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';
import { computeSettlementSummary, settlementValuesFromRow } from '../lib/settlements.ts';

const year = Number(process.argv[2]) || new Date().getFullYear();
const rangeStart = `${year}-01-01`;
const rangeEnd = `${year}-12-31`;

process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
console.log(`host: ${new URL(url).hostname}`);
console.log(`year: ${year} (${rangeStart} … ${rangeEnd})\n`);

const sql = postgres(url, { ssl: sslOptionFor(url), max: 1 });

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (n) => n.toLocaleString('en-US');

try {
  // ---- Countable stats (plain SQL) ----
  const [counts] = await sql`
    select
      (select count(*) from shows sh
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as shows,
      (select count(*) from show_bands sb join shows sh on sh.id = sb.show_id
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as sets,
      (select count(distinct sb.band_id) from show_bands sb join shows sh on sh.id = sb.show_id
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as distinct_bands
  `;

  // ---- Square ticket sales (ticket_purchases, cents; scoped by show date) ----
  // Rows are unique per (payment, variation) since migration 081, so SUM all
  // completed rows — do NOT dedupe by payment id (drops multi-line payments).
  const [tix] = await sql`
    select
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'completed'), 0)::bigint as cents_completed,
      coalesce(sum(tp.quantity)     filter (where tp.status = 'completed'), 0)::int    as qty_completed,
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'refunded'),  0)::bigint as cents_refunded,
      count(distinct tp.square_payment_id) filter (where tp.status = 'completed')::int as distinct_orders
    from ticket_purchases tp
    join shows sh on sh.id = tp.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
  `;

  // Busiest / biggest show by tickets sold
  const topShows = await sql`
    select sh.title, sh.date::text as date,
      coalesce(sum(tp.quantity)     filter (where tp.status = 'completed'), 0)::int    as qty,
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'completed'), 0)::bigint as cents
    from shows sh
    left join ticket_purchases tp on tp.show_id = sh.id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by sh.id, sh.title, sh.date
    order by qty desc, cents desc
    limit 5
  `;

  // ---- Settlement accounting (venue's own books) ----
  const settRows = await sql`
    select s.*, sh.title as show_title, sh.date::text as show_date
    from settlements s
    join shows sh on sh.id = s.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    order by sh.date asc
  `;

  // Per-band override/pct state, index-aligned per show (mirrors the admin summary route).
  const bandRows = await sql`
    select sb.show_id, sb.excluded, sb.payout_override, sb.payout_pct
    from show_bands sb
    join shows sh on sh.id = sb.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
  `;
  const overridesByShow = new Map();
  const pctsByShow = new Map();
  for (const b of bandRows) {
    if (b.excluded) continue;
    const showId = Number(b.show_id);
    const overrides = overridesByShow.get(showId) ?? [];
    overrides.push(b.payout_override === null ? null : Number(b.payout_override));
    overridesByShow.set(showId, overrides);
    const pcts = pctsByShow.get(showId) ?? [];
    pcts.push(b.payout_pct === null ? null : Number(b.payout_pct));
    pctsByShow.set(showId, pcts);
  }

  let grossIncome = 0; // settlement total income (square + venmo + cash + beverage)
  let artistPayouts = 0; // total actually paid to bands
  let venueExpenses = 0; // per-show venue expenses (excludes admin-help labor)
  let venueNet = 0; // per-show venue net (before admin-help labor)
  let incomeSquare = 0;
  let incomeVenmo = 0;
  let incomeCash = 0;
  let biggestPayout = { show: null, amount: 0 };

  for (const row of settRows) {
    const values = settlementValuesFromRow(row);
    const includedOverrides = overridesByShow.get(Number(row.show_id)) ?? [];
    const includedPcts = pctsByShow.get(Number(row.show_id)) ?? [];
    const summary = computeSettlementSummary(
      values,
      includedOverrides.length,
      includedOverrides,
      includedPcts
    );
    grossIncome += summary.totalIncome;
    artistPayouts += summary.bandPayout;
    venueExpenses += summary.totalExpenses;
    venueNet += summary.venueNet;
    incomeSquare += values.incomeSquare;
    incomeVenmo += values.incomeVenmo;
    incomeCash += values.incomeCash;
    if (summary.bandPayout > biggestPayout.amount) {
      biggestPayout = { show: `${row.show_title} (${row.show_date})`, amount: summary.bandPayout };
    }
  }

  // ---- Per-month + per-show detail (for dashboards / JSON export) ----
  // Tickets by month (Square online sales), keyed by 'YYYY-MM'.
  const ticketsByMonth = await sql`
    select to_char(sh.date, 'YYYY-MM') as month,
      coalesce(sum(tp.quantity)     filter (where tp.status = 'completed'), 0)::int    as qty,
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'completed'), 0)::bigint as cents
    from shows sh
    left join ticket_purchases tp on tp.show_id = sh.id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by 1 order by 1
  `;
  // Shows + band-slot counts by month.
  const showsByMonth = await sql`
    select to_char(sh.date, 'YYYY-MM') as month,
      count(distinct sh.id)::int as shows,
      count(sb.band_id)::int as sets
    from shows sh
    left join show_bands sb on sb.show_id = sh.id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by 1 order by 1
  `;
  // Band-slot counts per show (for the per-show table).
  const bandCountRows = await sql`
    select sb.show_id, count(*)::int as n
    from show_bands sb join shows sh on sh.id = sb.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by 1
  `;
  const bandCountByShow = new Map(bandCountRows.map((r) => [Number(r.show_id), r.n]));
  // Tickets per settled show.
  const tixByShowRows = await sql`
    select tp.show_id,
      coalesce(sum(tp.quantity)     filter (where tp.status = 'completed'), 0)::int    as qty,
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'completed'), 0)::bigint as cents
    from ticket_purchases tp join shows sh on sh.id = tp.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by 1
  `;
  const tixByShow = new Map(tixByShowRows.map((r) => [Number(r.show_id), { qty: r.qty, cents: Number(r.cents) }]));

  // Recompute per-show settlement summaries into a table + monthly money rollup.
  const monthMoney = new Map(); // month -> {income, payouts, square, venmo, cash}
  const perShow = [];
  for (const row of settRows) {
    const values = settlementValuesFromRow(row);
    const includedOverrides = overridesByShow.get(Number(row.show_id)) ?? [];
    const includedPcts = pctsByShow.get(Number(row.show_id)) ?? [];
    const summary = computeSettlementSummary(values, includedOverrides.length, includedOverrides, includedPcts);
    const month = row.show_date.slice(0, 7);
    const m = monthMoney.get(month) ?? { income: 0, payouts: 0, square: 0, venmo: 0, cash: 0 };
    m.income += summary.totalIncome;
    m.payouts += summary.bandPayout;
    m.square += values.incomeSquare;
    m.venmo += values.incomeVenmo;
    m.cash += values.incomeCash;
    monthMoney.set(month, m);
    const t = tixByShow.get(Number(row.show_id)) ?? { qty: 0, cents: 0 };
    perShow.push({
      showId: Number(row.show_id),
      date: row.show_date,
      title: row.show_title,
      bands: bandCountByShow.get(Number(row.show_id)) ?? 0,
      ticketsSold: t.qty,
      ticketRevenue: t.cents / 100,
      totalIncome: summary.totalIncome,
      bandPayout: summary.bandPayout,
      venueNet: summary.venueNet,
    });
  }

  if (process.argv.includes('--json')) {
    const tixMonthMap = new Map(ticketsByMonth.map((r) => [r.month, { qty: r.qty, cents: Number(r.cents) }]));
    const showMonthMap = new Map(showsByMonth.map((r) => [r.month, { shows: r.shows, sets: r.sets }]));
    const months = Array.from(new Set([...tixMonthMap.keys(), ...showMonthMap.keys(), ...monthMoney.keys()])).sort();
    const monthly = months.map((month) => ({
      month,
      shows: showMonthMap.get(month)?.shows ?? 0,
      sets: showMonthMap.get(month)?.sets ?? 0,
      ticketsSold: tixMonthMap.get(month)?.qty ?? 0,
      ticketRevenue: (tixMonthMap.get(month)?.cents ?? 0) / 100,
      totalIncome: monthMoney.get(month)?.income ?? 0,
      bandPayout: monthMoney.get(month)?.payouts ?? 0,
      incomeSquare: monthMoney.get(month)?.square ?? 0,
      incomeVenmo: monthMoney.get(month)?.venmo ?? 0,
      incomeCash: monthMoney.get(month)?.cash ?? 0,
    }));
    process.stdout.write(
      JSON.stringify(
        {
          year,
          totals: {
            shows: Number(counts.shows),
            bands: Number(counts.distinct_bands),
            sets: Number(counts.sets),
            ticketsSold: Number(tix.qty_completed),
            orders: Number(tix.distinct_orders),
            ticketRevenue: Number(tix.cents_completed) / 100,
            totalIncome: grossIncome,
            bandPayout: artistPayouts,
            venueExpenses,
            venueNet,
            incomeSquare,
            incomeVenmo,
            incomeCash,
          },
          monthly,
          perShow,
        },
        null,
        2
      ) + '\n'
    );
    await sql.end();
    process.exit(0);
  }

  // ---- Report ----
  const centsCompleted = Number(tix.cents_completed);
  const centsRefunded = Number(tix.cents_refunded);

  console.log(`═══ Birdhaus ${year} — Year in Review ═══\n`);
  console.log(`Shows                 ${num(Number(counts.shows))}`);
  console.log(`Bands (distinct)      ${num(Number(counts.distinct_bands))}`);
  console.log(`Sets (lineup slots)   ${num(Number(counts.sets))}`);
  console.log('');
  console.log(`— Tickets (Square, card sales) —`);
  console.log(`  Tickets sold        ${num(Number(tix.qty_completed))}`);
  console.log(`  Orders              ${num(Number(tix.distinct_orders))}`);
  console.log(`  Gross ticket rev    ${usd(centsCompleted / 100)}`);
  if (centsRefunded > 0) console.log(`  Refunded            ${usd(centsRefunded / 100)}`);
  console.log('');
  console.log(`— Settlements (venue books; ${settRows.length} shows settled) —`);
  console.log(`  Total income        ${usd(grossIncome)}   (square ${usd(incomeSquare)} · venmo ${usd(incomeVenmo)} · cash ${usd(incomeCash)})`);
  console.log(`  Paid out to bands   ${usd(artistPayouts)}`);
  console.log(`  Venue expenses      ${usd(venueExpenses)}   (excludes admin-help labor)`);
  console.log(`  Venue net           ${usd(venueNet)}   (before admin-help labor)`);
  if (biggestPayout.show)
    console.log(`  Biggest band payout ${usd(biggestPayout.amount)} — ${biggestPayout.show}`);
  console.log('');
  console.log(`— Top shows by tickets sold —`);
  for (const s of topShows) {
    console.log(`  ${String(Number(s.qty)).padStart(4)} tix · ${usd(Number(s.cents) / 100).padStart(9)} — ${s.title} (${s.date})`);
  }
} finally {
  await sql.end();
}
