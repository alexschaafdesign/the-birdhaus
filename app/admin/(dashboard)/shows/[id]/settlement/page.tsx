import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import {
  computeSettlementSummary,
  dealTermsLabel,
  formatCurrency,
  settlementValuesFromRow,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type SettlementDbRow,
} from '@/lib/settlements';

export const dynamic = 'force-dynamic';

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={bold ? '' : 'text-[#E8E0D0]/60'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string }[]>`select id, title from shows where id = ${showId}`;
  if (!show) notFound();

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  const [{ count: bandCount }] = await sql<
    { count: number }[]
  >`select count(*)::int as count from show_bands where show_id = ${showId}`;

  const editHref = `/admin/shows/${showId}/settlement/edit`;

  if (!settlementRow) {
    return (
      <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settlement — {show.title}</h1>
          <Link href={`/admin/shows/${showId}`} className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]">
            ← Back to show
          </Link>
        </div>
        <div className="border border-[#E8E0D0]/15 rounded-lg p-8 text-center space-y-4">
          <p className="text-[#E8E0D0]/60">No settlement recorded yet.</p>
          <Link
            href={editHref}
            className="inline-block border border-[#E8E0D0] rounded px-6 py-2 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors"
          >
            Record settlement
          </Link>
        </div>
      </main>
    );
  }

  const values = settlementValuesFromRow(settlementRow);
  const summary = computeSettlementSummary(values, bandCount);
  const incomeItems = values.extraLineItems.filter((item) => item.type === 'income');
  const expenseItems = values.extraLineItems.filter((item) => item.type === 'expense');

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settlement — {show.title}</h1>
        <div className="flex items-center gap-4">
          <Link href={editHref} className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]">
            Edit →
          </Link>
          <Link href={`/admin/shows/${showId}`} className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]">
            ← Back to show
          </Link>
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-6 space-y-6">
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/40 mb-2">Show Income</h2>
            {SHOW_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            {incomeItems.map((item, i) => (
              <Row key={`extra-income-${i}`} label={item.label} value={formatCurrency(item.amount)} />
            ))}
            <div className="pt-2 border-t border-[#E8E0D0]/10">
              <Row label="TOTAL INCOME" value={formatCurrency(summary.totalIncome)} bold />
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/40 mb-2">Venue Expenses</h2>
            {VENUE_EXPENSE_FIELDS.map(({ key, label }) => {
              const payee = PAYEE_EXPENSE_FIELDS.find((p) => p.amountKey === key);
              const name = payee ? values[payee.nameKey] : null;
              return (
                <Row key={key} label={name ? `${label} — ${name}` : label} value={formatCurrency(values[key])} />
              );
            })}
            {expenseItems.map((item, i) => (
              <Row key={`extra-expense-${i}`} label={item.label} value={formatCurrency(item.amount)} />
            ))}
            <div className="pt-2 border-t border-[#E8E0D0]/10">
              <Row label="TOTAL EXPENSES" value={formatCurrency(summary.totalExpenses)} bold />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E8E0D0]/10 space-y-2 text-sm">
          <p className="text-[#E8E0D0]/60">{dealTermsLabel(values)}</p>
          <Row label="ARTISTS split" value={formatCurrency(summary.artistPool)} bold />
          <Row label="VENUE split" value={formatCurrency(summary.venueSplit)} bold />
          <Row label={`PER BAND (${bandCount || 0})`} value={formatCurrency(summary.perBand)} bold />
        </div>

        <div className="pt-4 border-t border-[#E8E0D0]/10 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/40 mb-2">
            Venue Additional Income
          </h2>
          {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
            <Row key={key} label={label} value={formatCurrency(values[key])} />
          ))}
          <div className="pt-2 border-t border-[#E8E0D0]/10">
            <Row label="TOTAL" value={formatCurrency(summary.venueAdditionalIncome)} bold />
          </div>
        </div>

        <div className="pt-4 border-t border-[#E8E0D0]/10 space-y-2 text-sm">
          <Row label="VENUE TOTAL INCOME" value={formatCurrency(summary.venueTotalIncome)} bold />
          <Row label="VENUE NET" value={formatCurrency(summary.venueNet)} bold />
        </div>

        {values.notes && (
          <div className="pt-4 border-t border-[#E8E0D0]/10 space-y-1 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/40">Notes</h2>
            <p className="text-[#E8E0D0]/80 whitespace-pre-wrap">{values.notes}</p>
          </div>
        )}
      </div>
    </main>
  );
}
