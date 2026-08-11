import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  computeSettlementSummary,
  settlementValuesFromRow,
  PAYEE_EXPENSE_FIELDS,
  VENUE_EXPENSE_FIELDS,
  type PayeeNameField,
  type SettlementDbRow,
} from '@/lib/settlements';
import { paidTotalsByWorker } from '@/lib/timesheet';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface SettlementSummaryRow extends SettlementDbRow {
  show_id: number;
  show_title: string;
  show_date: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  let rangeStart: string;
  let rangeEnd: string;

  if (startParam || endParam) {
    if (!startParam || !endParam || !ISO_DATE_RE.test(startParam) || !ISO_DATE_RE.test(endParam)) {
      return NextResponse.json({ error: 'Invalid start/end date' }, { status: 400 });
    }
    rangeStart = startParam;
    rangeEnd = endParam;
  } else {
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    rangeStart = `${year}-01-01`;
    rangeEnd = `${year}-12-31`;
  }

  const rows = await sql<SettlementSummaryRow[]>`
    select s.*, sh.title as show_title, sh.date::text as show_date
    from settlements s
    join shows sh on sh.id = s.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
    order by sh.date asc
  `;

  const yearRows = await sql<{ year: number }[]>`
    select distinct extract(year from sh.date)::int as year
    from settlements s
    join shows sh on sh.id = s.show_id
    order by year desc
  `;

  // Per-band payout state for the shows in range, so the rollup's venue net
  // reflects any amounts bands declined from their share (kept as venue profit),
  // matching each show's own settlement page. Only non-excluded bands share the
  // split; a null override means the band takes the even share.
  const bandRows = await sql<{ show_id: number; excluded: boolean; payout_override: string | null }[]>`
    select sb.show_id, sb.excluded, sb.payout_override
    from show_bands sb
    join shows sh on sh.id = sb.show_id
    where sh.date >= ${rangeStart} and sh.date <= ${rangeEnd}
  `;
  const overridesByShow = new Map<number, (number | null)[]>();
  for (const b of bandRows) {
    if (b.excluded) continue;
    const list = overridesByShow.get(b.show_id) ?? [];
    list.push(b.payout_override === null ? null : Number(b.payout_override));
    overridesByShow.set(b.show_id, list);
  }

  let grossIncome = 0;
  let artistPayouts = 0;
  let venueExpenses = 0;
  let venueAdditionalIncome = 0;
  let venueNet = 0;

  let incomeSquare = 0;
  let incomeVenmo = 0;
  let incomeCash = 0;

  const expenseTotals = Object.fromEntries(VENUE_EXPENSE_FIELDS.map(({ key }) => [key, 0])) as Record<
    (typeof VENUE_EXPENSE_FIELDS)[number]['key'],
    number
  >;

  let extraIncomeTotal = 0;
  let extraExpenseTotal = 0;

  // Average band payout: over shows that actually have band data (>=1 included
  // band), the total paid to bands divided by the total number of band slots —
  // i.e. what the average band walked away with per show. Shows with no band
  // data are skipped so they don't drag the average toward zero.
  let bandPayoutForAvg = 0;
  let bandSlotsForAvg = 0;
  let bandPayoutShowCount = 0;

  const payeeTotals = new Map<PayeeNameField, Map<string, number>>(
    PAYEE_EXPENSE_FIELDS.map(({ nameKey }) => [nameKey, new Map<string, number>()])
  );

  const perShow = rows.map((row) => {
    const values = settlementValuesFromRow(row);
    const includedOverrides = overridesByShow.get(Number(row.show_id)) ?? [];
    const summary = computeSettlementSummary(values, includedOverrides.length, includedOverrides);

    grossIncome += summary.totalIncome;
    // Actual paid to bands after any overrides (equals the pool when none apply).
    artistPayouts += summary.bandPayout;
    venueExpenses += summary.totalExpenses;
    venueAdditionalIncome += summary.venueAdditionalIncome;
    venueNet += summary.venueNet;

    if (includedOverrides.length > 0) {
      bandPayoutForAvg += summary.bandPayout;
      bandSlotsForAvg += includedOverrides.length;
      bandPayoutShowCount += 1;
    }

    incomeSquare += values.incomeSquare;
    incomeVenmo += values.incomeVenmo;
    incomeCash += values.incomeCash;

    for (const { key } of VENUE_EXPENSE_FIELDS) {
      expenseTotals[key] += values[key];
    }

    for (const item of values.extraLineItems) {
      if (item.type === 'income') extraIncomeTotal += item.amount;
      else extraExpenseTotal += item.amount;
    }

    for (const { amountKey, nameKey } of PAYEE_EXPENSE_FIELDS) {
      const amount = values[amountKey];
      if (amount <= 0) continue;
      const name = values[nameKey]?.trim() || 'Unspecified';
      const totals = payeeTotals.get(nameKey)!;
      totals.set(name, (totals.get(name) ?? 0) + amount);
    }

    return {
      showId: Number(row.show_id),
      showName: row.show_title,
      showDate: row.show_date,
      grossIncome: summary.totalIncome,
      venueNet: summary.venueNet,
      dealType: values.dealType,
    };
  });

  // Admin help (timesheet) is a venue-level operating expense not tied to any
  // one show. Cash-basis: count what was actually paid to helpers during the
  // range (by paid_date), which is the number that matters for taxes.
  const adminHelp = await paidTotalsByWorker(rangeStart, rangeEnd);
  const adminHelpTotal = adminHelp.reduce((sum, w) => sum + w.amount, 0);
  venueExpenses += adminHelpTotal;
  venueNet -= adminHelpTotal;

  const expensesByCategory = [
    ...VENUE_EXPENSE_FIELDS.map(({ key, label }) => ({ key, label, amount: expenseTotals[key] })),
    { key: 'admin_help', label: 'Admin help', amount: adminHelpTotal },
    // Extra line items aren't tied to a fixed category — net them into one row.
    // Positive = net additional expense across the range; negative = net additional income.
    { key: 'other', label: 'Other', amount: extraExpenseTotal - extraIncomeTotal },
  ];

  const payeeBreakdown = [
    ...PAYEE_EXPENSE_FIELDS.map(({ nameKey, label }) => ({
      role: label,
      payees: Array.from(payeeTotals.get(nameKey)!, ([name, amount]) => ({ name, amount })).sort(
        (a, b) => b.amount - a.amount
      ),
    })),
    { role: 'Admin help', payees: adminHelp.sort((a, b) => b.amount - a.amount) },
  ];

  return NextResponse.json({
    totals: {
      grossIncome,
      artistPayouts,
      venueExpenses,
      venueAdditionalIncome,
      venueNet,
      averageBandPayout: bandSlotsForAvg > 0 ? bandPayoutForAvg / bandSlotsForAvg : null,
      bandPayoutShowCount,
    },
    incomeByMethod: { square: incomeSquare, venmo: incomeVenmo, cash: incomeCash },
    expensesByCategory,
    payeeBreakdown,
    perShow,
    availableYears: yearRows.map((r) => r.year),
  });
}
