import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import {
  computeSettlementSummary,
  dealTermsLabel,
  formatCurrency,
  formatPct,
  settlementValuesFromRow,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type SettlementDbRow,
} from '@/lib/settlements';

export const dynamic = 'force-dynamic';

const ACCENT = {
  neutral: 'bg-[#E8E0D0]/50',
  income: 'bg-emerald-400',
  expense: 'bg-amber-400',
} as const;

function SectionCard({
  title,
  accent = 'neutral',
  children,
}: {
  title: string;
  accent?: keyof typeof ACCENT;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/50 mb-3">
        <span className={`h-1.5 w-1.5 rounded-full ${ACCENT[accent]}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold' : ''}`}>
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
        <div className="space-y-2">
          <Link
            href={`/admin/shows/${showId}`}
            className="inline-flex items-center gap-1 text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors"
          >
            ← Back to show
          </Link>
          <h1 className="text-2xl font-bold">Settlement — {show.title}</h1>
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
  const hasAdditionalIncome = VENUE_ADDITIONAL_INCOME_FIELDS.some((f) => values[f.key] !== 0);
  const pdfHref = `/api/admin/settlements/${showId}/pdf`;

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-2">
        <Link
          href={`/admin/shows/${showId}`}
          className="inline-flex items-center gap-1 text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors"
        >
          ← Back to show
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settlement — {show.title}</h1>
          <div className="flex items-center gap-2">
            <a
              href={pdfHref}
              title="Download PDF"
              className="flex items-center gap-1.5 text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v13m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              PDF
            </a>
            <Link
              href={editHref}
              title="Edit settlement"
              aria-label="Edit settlement"
              className="flex items-center justify-center border border-[#E8E0D0]/30 rounded p-[9px] hover:bg-[#E8E0D0]/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.06] px-5 py-3 flex items-center justify-between">
        <p className="text-sm text-[#E8E0D0]/70">{dealTermsLabel(values)}</p>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">Per band ({bandCount || 0})</p>
          <p className="text-base font-semibold">{formatCurrency(summary.perBand)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="Show Income" accent="income">
          <div className="space-y-1.5">
            {SHOW_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            {incomeItems.map((item, i) => (
              <Row key={`extra-income-${i}`} label={item.label} value={formatCurrency(item.amount)} />
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-[#E8E0D0]/10">
              <Row label="Total income" value={formatCurrency(summary.totalIncome)} bold />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Venue Expenses" accent="expense">
          <div className="space-y-1.5">
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
            <div className="pt-1.5 mt-1.5 border-t border-[#E8E0D0]/10">
              <Row label="Total expenses" value={formatCurrency(summary.totalExpenses)} bold />
            </div>
          </div>
        </SectionCard>
      </div>

      {hasAdditionalIncome && (
        <SectionCard title="Venue Additional Income" accent="income">
          <div className="space-y-1.5">
            {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-[#E8E0D0]/10">
              <Row label="Total" value={formatCurrency(summary.venueAdditionalIncome)} bold />
            </div>
          </div>
        </SectionCard>
      )}

      <div className="rounded-lg border border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.06] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/50 mb-3">Summary</h2>
        <div className="space-y-1.5">
          <Row label="Artist split" value={formatCurrency(summary.artistPool)} bold />
          <Row label="Venue split" value={formatCurrency(summary.venueSplit)} bold />
          <Row label="Venue total income" value={formatCurrency(summary.venueTotalIncome)} bold />
          {summary.venueRedirect !== 0 && (
            <Row
              label={`Venue redirect (${formatPct(values.venueRedirectPct)}%)`}
              value={`−${formatCurrency(summary.venueRedirect)}`}
            />
          )}
        </div>
        <div
          className={`mt-3 flex justify-between items-center rounded-md px-3 py-2 font-semibold ${
            summary.venueNet >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
          }`}
        >
          <span>Venue net</span>
          <span className="text-base">{formatCurrency(summary.venueNet)}</span>
        </div>
      </div>

      {values.notes && (
        <SectionCard title="Notes">
          <p className="text-sm text-[#E8E0D0]/80 whitespace-pre-wrap">{values.notes}</p>
        </SectionCard>
      )}
    </main>
  );
}
