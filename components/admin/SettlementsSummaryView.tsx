'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, type DealType } from '@/lib/settlements';

interface Totals {
  grossIncome: number;
  artistPayouts: number;
  venueExpenses: number;
  venueAdditionalIncome: number;
  venueNet: number;
}

interface IncomeByMethod {
  square: number;
  venmo: number;
  cash: number;
}

interface ExpenseCategory {
  key: string;
  label: string;
  amount: number;
}

interface PerShowRow {
  showId: number;
  showName: string;
  showDate: string;
  grossIncome: number;
  venueNet: number;
  dealType: DealType;
}

interface PayeeAmount {
  name: string;
  amount: number;
}

interface PayeeBreakdownEntry {
  role: string;
  payees: PayeeAmount[];
}

interface SummaryResponse {
  totals: Totals;
  incomeByMethod: IncomeByMethod;
  expensesByCategory: ExpenseCategory[];
  payeeBreakdown: PayeeBreakdownEntry[];
  perShow: PerShowRow[];
  availableYears: number[];
}

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  straight_split: 'Straight split',
  venue_guarantee_then_split: 'Venue guarantee, then split',
};

const cardClass = 'border border-[#E8E0D0]/15 rounded-lg p-4';
const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0]';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[#E8E0D0]/60">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsv(data: SummaryResponse): string {
  const lines: string[] = [];

  lines.push('Totals');
  lines.push(['Metric', 'Amount'].join(','));
  lines.push(['Total income', data.totals.grossIncome].map(csvEscape).join(','));
  lines.push(['Artist payouts', data.totals.artistPayouts].map(csvEscape).join(','));
  lines.push(['Venue expenses', data.totals.venueExpenses].map(csvEscape).join(','));
  lines.push(['Venue additional income', data.totals.venueAdditionalIncome].map(csvEscape).join(','));
  lines.push(['Venue net', data.totals.venueNet].map(csvEscape).join(','));
  lines.push('');

  lines.push('Income by method');
  lines.push(['Method', 'Amount'].join(','));
  lines.push(['Square', data.incomeByMethod.square].map(csvEscape).join(','));
  lines.push(['Venmo', data.incomeByMethod.venmo].map(csvEscape).join(','));
  lines.push(['Cash', data.incomeByMethod.cash].map(csvEscape).join(','));
  lines.push('');

  lines.push('Expenses by category');
  lines.push(['Category', 'Amount'].join(','));
  for (const cat of data.expensesByCategory) {
    lines.push([cat.label, cat.amount].map(csvEscape).join(','));
  }
  lines.push('');

  lines.push('Paid to');
  lines.push(['Role', 'Name', 'Amount'].join(','));
  for (const entry of data.payeeBreakdown) {
    for (const payee of entry.payees) {
      lines.push([entry.role, payee.name, payee.amount].map(csvEscape).join(','));
    }
  }
  lines.push('');

  lines.push('Per show');
  lines.push(['Date', 'Show', 'Gross income', 'Venue net', 'Deal type'].join(','));
  for (const row of data.perShow) {
    lines.push(
      [row.showDate, row.showName, row.grossIncome, row.venueNet, DEAL_TYPE_LABELS[row.dealType]]
        .map(csvEscape)
        .join(',')
    );
  }

  return lines.join('\n');
}

export default function SettlementsSummaryView() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<'year' | 'range'>('year');
  const [year, setYear] = useState(currentYear);
  const [start, setStart] = useState(`${currentYear}-01-01`);
  const [end, setEnd] = useState(`${currentYear}-12-31`);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === 'year') {
      params.set('year', String(year));
    } else {
      params.set('start', start);
      params.set('end', end);
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/settlements/summary?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || 'Failed to load summary');
        if (!cancelled) setData(body as SummaryResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, year, start, end]);

  const years = useMemo(() => {
    const set = new Set(data?.availableYears ?? []);
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [data, currentYear]);

  function exportCsv() {
    if (!data) return;
    const csv = buildCsv(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const label = mode === 'year' ? String(year) : `${start}_to_${end}`;
    a.href = url;
    a.download = `settlements-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Settlements Summary</h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data}
          className="border border-[#E8E0D0] rounded px-4 py-2 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('year')}
            className={mode === 'year' ? 'underline text-[#E8E0D0]' : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0]'}
          >
            Year
          </button>
          <span className="text-[#E8E0D0]/30">/</span>
          <button
            type="button"
            onClick={() => setMode('range')}
            className={mode === 'range' ? 'underline text-[#E8E0D0]' : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0]'}
          >
            Custom range
          </button>
        </div>

        {mode === 'year' ? (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            <span className="text-[#E8E0D0]/40">to</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">{error}</div>
      )}

      {loading && !data && <p className="text-sm text-[#E8E0D0]/50">Loading…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className={cardClass}>
              <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Total income</p>
              <p className="text-xl font-semibold">{formatCurrency(data.totals.grossIncome)}</p>
            </div>
            <div className={`${cardClass} opacity-70`}>
              <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
                Artist payouts <span className="text-[#E8E0D0]/30">(pass-through)</span>
              </p>
              <p className="text-xl font-semibold text-[#E8E0D0]/70">{formatCurrency(data.totals.artistPayouts)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Venue expenses</p>
              <p className="text-xl font-semibold">{formatCurrency(data.totals.venueExpenses)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Venue additional income</p>
              <p className="text-xl font-semibold">{formatCurrency(data.totals.venueAdditionalIncome)}</p>
            </div>
            <div className="border-2 border-[#E8E0D0] rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60 mb-1">Venue net</p>
              <p className="text-2xl font-bold">{formatCurrency(data.totals.venueNet)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={cardClass}>
              <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Income by method</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Square" value={formatCurrency(data.incomeByMethod.square)} />
                <Row label="Venmo" value={formatCurrency(data.incomeByMethod.venmo)} />
                <Row label="Cash" value={formatCurrency(data.incomeByMethod.cash)} />
              </dl>
            </div>
            <div className={cardClass}>
              <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Expenses by category</h2>
              <dl className="space-y-2 text-sm">
                {data.expensesByCategory.map((cat) => (
                  <Row key={cat.key} label={cat.label} value={formatCurrency(cat.amount)} />
                ))}
              </dl>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Paid to</h2>
            {data.payeeBreakdown.every((entry) => entry.payees.length === 0) ? (
              <p className="text-xs text-[#E8E0D0]/30">No payee amounts recorded in this range.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.payeeBreakdown.map((entry) => (
                  <div key={entry.role}>
                    <h3 className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-2">{entry.role}</h3>
                    {entry.payees.length === 0 ? (
                      <p className="text-xs text-[#E8E0D0]/30">None recorded.</p>
                    ) : (
                      <dl className="space-y-2 text-sm">
                        {entry.payees.map((payee) => (
                          <Row key={payee.name} label={payee.name} value={formatCurrency(payee.amount)} />
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Per show</h2>
            {data.perShow.length === 0 ? (
              <p className="text-xs text-[#E8E0D0]/30">No settlements in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#E8E0D0]/40 border-b border-[#E8E0D0]/10">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Show</th>
                      <th className="py-2 pr-4">Gross income</th>
                      <th className="py-2 pr-4">Venue net</th>
                      <th className="py-2 pr-4">Deal type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perShow.map((row) => (
                      <tr
                        key={row.showId}
                        onClick={() => router.push(`/admin/shows/${row.showId}/settlement`)}
                        className="border-b border-[#E8E0D0]/5 hover:bg-[#E8E0D0]/5 cursor-pointer"
                      >
                        <td className="py-2 pr-4">{row.showDate}</td>
                        <td className="py-2 pr-4 underline">{row.showName}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.grossIncome)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.venueNet)}</td>
                        <td className="py-2 pr-4">{DEAL_TYPE_LABELS[row.dealType]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
