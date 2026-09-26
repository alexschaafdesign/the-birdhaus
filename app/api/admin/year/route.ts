import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  computeSettlementSummary,
  settlementValuesFromRow,
  type SettlementDbRow,
} from '@/lib/settlements';
import { requireAdmin } from '@/lib/admin-session';

// Year-in-review rollup. Money math reuses computeSettlementSummary so the
// figures match each show's own settlement page and the settlements summary.

interface YearSettlementRow extends SettlementDbRow {
  show_id: number;
  show_title: string;
  show_date: string;
  attendance: number | null;
}

export interface YearPerShow {
  showId: number;
  date: string;
  title: string;
  bands: number;
  ticketsSold: number;
  attendance: number | null;
  totalIncome: number;
  bandPayout: number;
  venueNet: number;
}

export interface YearMonth {
  month: string; // YYYY-MM
  shows: number;
  sets: number;
  ticketsSold: number;
  incomeSquare: number;
  incomeVenmo: number;
  incomeCash: number;
  totalIncome: number;
  bandPayout: number;
}

// Monday of the ISO week containing dateStr, as YYYY-MM-DD.
function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function addMonth(ym: string): string {
  let [y, m] = ym.split('-').map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  const rangeStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;

  // Countable totals (independent of settlements).
  const [counts] = await sql<{ shows: number; sets: number; bands: number }[]>`
    select
      (select count(*)::int from shows sh
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as shows,
      (select count(*)::int from show_bands sb join shows sh on sh.id = sb.show_id
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as sets,
      (select count(distinct sb.band_id)::int from show_bands sb join shows sh on sh.id = sb.show_id
         where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}) as bands
  `;

  // Square ticket sales. Rows are unique per (payment, variation) since migration
  // 081, so SUM all completed rows — never dedupe by payment id.
  const [tix] = await sql<
    { qty: number; cents: string; orders: number }[]
  >`
    select
      coalesce(sum(tp.quantity)     filter (where tp.status = 'completed'), 0)::int    as qty,
      coalesce(sum(tp.amount_cents) filter (where tp.status = 'completed'), 0)::bigint as cents,
      count(distinct tp.square_payment_id) filter (where tp.status = 'completed')::int as orders
    from ticket_purchases tp
    join shows sh on sh.id = tp.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
  `;

  // Bands that played more than one show this year.
  const repeatRows = await sql<{ name: string; n: number }[]>`
    select b.name, count(*)::int as n
    from show_bands sb
    join shows sh on sh.id = sb.show_id
    join bands b on b.id = sb.band_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by b.id, b.name
    having count(*) > 1
    order by n desc, b.name asc
  `;

  // Band-slot count + Square tickets per show.
  const bandCountRows = await sql<{ show_id: string; n: number }[]>`
    select sb.show_id, count(*)::int as n
    from show_bands sb join shows sh on sh.id = sb.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by sb.show_id
  `;
  const bandCountByShow = new Map(bandCountRows.map((r) => [Number(r.show_id), r.n]));

  const tixByShowRows = await sql<{ show_id: string; qty: number }[]>`
    select tp.show_id,
      coalesce(sum(tp.quantity) filter (where tp.status = 'completed'), 0)::int as qty
    from ticket_purchases tp join shows sh on sh.id = tp.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by tp.show_id
  `;
  const tixByShow = new Map(tixByShowRows.map((r) => [Number(r.show_id), r.qty]));

  // Settlements for the year, plus every show's shape for the monthly show/set
  // counts (a show with no settlement still counts toward activity).
  const settRows = await sql<YearSettlementRow[]>`
    select s.*, sh.title as show_title, sh.date::text as show_date, s.attendance
    from settlements s
    join shows sh on sh.id = s.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    order by sh.date asc
  `;

  const allShows = await sql<{ show_id: string; show_date: string }[]>`
    select sh.id as show_id, sh.date::text as show_date
    from shows sh
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    order by sh.date asc
  `;

  // Per-band override/pct state, index-aligned per show (mirrors the summary route).
  const bandRows = await sql<
    { show_id: string; excluded: boolean; payout_override: string | null; payout_pct: string | null }[]
  >`
    select sb.show_id, sb.excluded, sb.payout_override, sb.payout_pct
    from show_bands sb
    join shows sh on sh.id = sb.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
  `;
  const overridesByShow = new Map<number, (number | null)[]>();
  const pctsByShow = new Map<number, (number | null)[]>();
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

  // Accumulate money totals + build the per-show table.
  let totalIncome = 0;
  let bandPayout = 0;
  let venueExpenses = 0;
  let venueNet = 0;
  let incomeSquare = 0;
  let incomeVenmo = 0;
  let incomeCash = 0;
  let totalAttendance = 0;
  let attendanceShowCount = 0;

  const monthMoney = new Map<
    string,
    { income: number; payout: number; square: number; venmo: number; cash: number }
  >();
  const perShow: YearPerShow[] = [];

  for (const row of settRows) {
    const values = settlementValuesFromRow(row);
    const includedOverrides = overridesByShow.get(Number(row.show_id)) ?? [];
    const includedPcts = pctsByShow.get(Number(row.show_id)) ?? [];
    const summary = computeSettlementSummary(values, includedOverrides.length, includedOverrides, includedPcts);

    totalIncome += summary.totalIncome;
    bandPayout += summary.bandPayout;
    venueExpenses += summary.totalExpenses;
    venueNet += summary.venueNet;
    incomeSquare += values.incomeSquare;
    incomeVenmo += values.incomeVenmo;
    incomeCash += values.incomeCash;

    const attendance = row.attendance == null ? null : Number(row.attendance);
    if (attendance && attendance > 0) {
      totalAttendance += attendance;
      attendanceShowCount += 1;
    }

    const month = row.show_date.slice(0, 7);
    const m = monthMoney.get(month) ?? { income: 0, payout: 0, square: 0, venmo: 0, cash: 0 };
    m.income += summary.totalIncome;
    m.payout += summary.bandPayout;
    m.square += values.incomeSquare;
    m.venmo += values.incomeVenmo;
    m.cash += values.incomeCash;
    monthMoney.set(month, m);

    perShow.push({
      showId: Number(row.show_id),
      date: row.show_date,
      title: row.show_title,
      bands: bandCountByShow.get(Number(row.show_id)) ?? 0,
      ticketsSold: tixByShow.get(Number(row.show_id)) ?? 0,
      attendance,
      totalIncome: summary.totalIncome,
      bandPayout: summary.bandPayout,
      venueNet: summary.venueNet,
    });
  }

  // Monthly show/set/ticket counts span every show, not just settled ones.
  const showsByMonth = new Map<string, { shows: number; sets: number }>();
  for (const s of allShows) {
    const month = s.show_date.slice(0, 7);
    const entry = showsByMonth.get(month) ?? { shows: 0, sets: 0 };
    entry.shows += 1;
    entry.sets += bandCountByShow.get(Number(s.show_id)) ?? 0;
    showsByMonth.set(month, entry);
  }
  const ticketsByMonthRows = await sql<{ month: string; qty: number }[]>`
    select to_char(sh.date, 'YYYY-MM') as month,
      coalesce(sum(tp.quantity) filter (where tp.status = 'completed'), 0)::int as qty
    from shows sh
    left join ticket_purchases tp on tp.show_id = sh.id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    group by 1
  `;
  const ticketsByMonth = new Map(ticketsByMonthRows.map((r) => [r.month, r.qty]));

  // Build a contiguous month list from the first to the last show month, so a
  // dark month (no shows) still appears as a gap in the timeline.
  const monthly: YearMonth[] = [];
  const monthKeys = allShows.map((s) => s.show_date.slice(0, 7));
  if (monthKeys.length > 0) {
    let cursor = monthKeys[0];
    const last = monthKeys[monthKeys.length - 1];
    // guard against an unbounded loop from bad data
    for (let i = 0; i < 24; i++) {
      const sm = showsByMonth.get(cursor);
      const mm = monthMoney.get(cursor);
      monthly.push({
        month: cursor,
        shows: sm?.shows ?? 0,
        sets: sm?.sets ?? 0,
        ticketsSold: ticketsByMonth.get(cursor) ?? 0,
        incomeSquare: mm?.square ?? 0,
        incomeVenmo: mm?.venmo ?? 0,
        incomeCash: mm?.cash ?? 0,
        totalIncome: mm?.income ?? 0,
        bandPayout: mm?.payout ?? 0,
      });
      if (cursor === last) break;
      cursor = addMonth(cursor);
    }
  }

  // Highlights from the per-show table.
  const settledShows = perShow.filter((s) => s.totalIncome > 0 || s.bandPayout > 0);
  const biggestPayout = perShow.reduce<YearPerShow | null>(
    (best, s) => (best === null || s.bandPayout > best.bandPayout ? s : best),
    null
  );
  const topTicketShow = perShow.reduce<YearPerShow | null>(
    (best, s) => (best === null || s.ticketsSold > best.ticketsSold ? s : best),
    null
  );
  const bestAttended = perShow
    .filter((s) => s.attendance && s.attendance > 0)
    .reduce<YearPerShow | null>(
      (best, s) => (best === null || (s.attendance ?? 0) > (best.attendance ?? 0) ? s : best),
      null
    );

  // Busiest weekend = the ISO week with the most shows (tie broken by tickets).
  const byWeek = new Map<
    string,
    { shows: number; tickets: number; attendance: number; first: string; last: string }
  >();
  for (const s of perShow) {
    const key = weekStart(s.date);
    const w = byWeek.get(key) ?? { shows: 0, tickets: 0, attendance: 0, first: s.date, last: s.date };
    w.shows += 1;
    w.tickets += s.ticketsSold;
    w.attendance += s.attendance ?? 0;
    if (s.date < w.first) w.first = s.date;
    if (s.date > w.last) w.last = s.date;
    byWeek.set(key, w);
  }
  let busiestWeekend: { start: string; end: string; shows: number; tickets: number } | null = null;
  for (const w of byWeek.values()) {
    if (
      busiestWeekend === null ||
      w.shows > busiestWeekend.shows ||
      (w.shows === busiestWeekend.shows && w.tickets > busiestWeekend.tickets)
    ) {
      busiestWeekend = { start: w.first, end: w.last, shows: w.shows, tickets: w.tickets };
    }
  }

  const yearRows = await sql<{ year: number }[]>`
    select distinct extract(year from sh.date)::int as year from shows sh order by year desc
  `;

  const shows = counts.shows;
  const sets = counts.sets;

  return NextResponse.json({
    year,
    totals: {
      shows,
      bands: counts.bands,
      sets,
      avgSetsPerShow: shows > 0 ? sets / shows : 0,
      ticketsSold: tix.qty,
      orders: tix.orders,
      ticketRevenue: Number(tix.cents) / 100,
      totalIncome,
      bandPayout,
      venueExpenses,
      venueNet,
      incomeSquare,
      incomeVenmo,
      incomeCash,
      repeatBands: repeatRows.length,
      totalAttendance,
      avgAttendance: attendanceShowCount > 0 ? totalAttendance / attendanceShowCount : null,
      attendanceShowCount,
      settledShows: settledShows.length,
    },
    highlights: {
      biggestPayout: biggestPayout && biggestPayout.bandPayout > 0
        ? { title: biggestPayout.title, date: biggestPayout.date, amount: biggestPayout.bandPayout }
        : null,
      topTicketShow: topTicketShow && topTicketShow.ticketsSold > 0
        ? { title: topTicketShow.title, date: topTicketShow.date, tickets: topTicketShow.ticketsSold }
        : null,
      bestAttended: bestAttended
        ? { title: bestAttended.title, date: bestAttended.date, attendance: bestAttended.attendance }
        : null,
      busiestWeekend,
      topRepeatBands: repeatRows.slice(0, 6).map((r) => ({ name: r.name, count: r.n })),
    },
    monthly,
    perShow,
    availableYears: yearRows.map((r) => r.year),
  });
}
