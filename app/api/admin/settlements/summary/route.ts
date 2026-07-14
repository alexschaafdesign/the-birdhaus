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

  const payeeTotals = new Map<PayeeNameField, Map<string, number>>(
    PAYEE_EXPENSE_FIELDS.map(({ nameKey }) => [nameKey, new Map<string, number>()])
  );

  const perShow = rows.map((row) => {
    const values = settlementValuesFromRow(row);
    const summary = computeSettlementSummary(values, 0);

    grossIncome += summary.totalIncome;
    artistPayouts += summary.artistPool;
    venueExpenses += summary.totalExpenses;
    venueAdditionalIncome += summary.venueAdditionalIncome;
    venueNet += summary.venueNet;

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

  const expensesByCategory = [
    ...VENUE_EXPENSE_FIELDS.map(({ key, label }) => ({ key, label, amount: expenseTotals[key] })),
    // Extra line items aren't tied to a fixed category — net them into one row.
    // Positive = net additional expense across the range; negative = net additional income.
    { key: 'other', label: 'Other', amount: extraExpenseTotal - extraIncomeTotal },
  ];

  const payeeBreakdown = PAYEE_EXPENSE_FIELDS.map(({ nameKey, label }) => ({
    role: label,
    payees: Array.from(payeeTotals.get(nameKey)!, ([name, amount]) => ({ name, amount })).sort(
      (a, b) => b.amount - a.amount
    ),
  }));

  return NextResponse.json({
    totals: { grossIncome, artistPayouts, venueExpenses, venueAdditionalIncome, venueNet },
    incomeByMethod: { square: incomeSquare, venmo: incomeVenmo, cash: incomeCash },
    expensesByCategory,
    payeeBreakdown,
    perShow,
    availableYears: yearRows.map((r) => r.year),
  });
}
