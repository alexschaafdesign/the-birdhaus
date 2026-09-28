'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/settlements';

// Dark-surface steps of the shared data-viz categorical palette (validated for
// the dark chart surface): Square / Venmo / Cash.
const SERIES = {
  square: '#3987e5',
  venmo: '#d95926',
  cash: '#199e70',
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Totals {
  shows: number;
  bands: number;
  sets: number;
  avgSetsPerShow: number;
  ticketsSold: number;
  orders: number;
  ticketRevenue: number;
  totalIncome: number;
  bandPayout: number;
  venueExpenses: number;
  venueNet: number;
  incomeSquare: number;
  incomeVenmo: number;
  incomeCash: number;
  repeatBands: number;
  totalAttendance: number;
  avgAttendance: number | null;
  attendanceShowCount: number;
  settledShows: number;
}

interface Highlights {
  biggestPayout: { title: string; date: string; amount: number } | null;
  topTicketShow: { title: string; date: string; tickets: number } | null;
  bestAttended: { title: string; date: string; attendance: number | null } | null;
  busiestWeekend: { start: string; end: string; shows: number; tickets: number } | null;
  topRepeatBands: { name: string; count: number }[];
}

interface Month {
  month: string;
  shows: number;
  sets: number;
  ticketsSold: number;
  incomeSquare: number;
  incomeVenmo: number;
  incomeCash: number;
  totalIncome: number;
  bandPayout: number;
}

interface PerShow {
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

interface YearResponse {
  year: number;
  totals: Totals;
  highlights: Highlights;
  monthly: Month[];
  perShow: PerShow[];
  availableYears: number[];
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
};

const cardClass = 'border border-[#E8E0D0]/15 rounded-lg p-4';
const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0]';

interface Tip {
  x: number;
  y: number;
  rows: { title: string; lines: [string, string][] };
}

function niceMax(v: number, steps = 4): number {
  if (v <= 0) return steps;
  const raw = v / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return step * steps;
}

// Shared geometry for both charts.
const W = 680;
const H = 280;
const PAD = { t: 22, r: 10, b: 30, l: 42 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

function StatTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? 'border-2 border-[#E8E0D0] rounded-lg p-4' : cardClass}>
      <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</p>
      <p className={`font-semibold tabular-nums ${emphasis ? 'text-2xl font-bold' : 'text-xl'}`}>{value}</p>
      {sub && <p className="text-xs text-[#E8E0D0]/30 mt-1">{sub}</p>}
    </div>
  );
}

export default function YearInReviewView() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<YearResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/year?year=${year}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || 'Failed to load year');
        if (!cancelled) setData(body as YearResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load year');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = useMemo(() => {
    const set = new Set(data?.availableYears ?? []);
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [data, currentYear]);

  const t = data?.totals;
  const h = data?.highlights;

  function showTip(e: React.MouseEvent, rows: Tip['rows']) {
    setTip({ x: e.clientX, y: e.clientY, rows });
  }

  // --- Chart 1: monthly income, stacked by method ---
  const incomeChart = useMemo(() => {
    if (!data || data.monthly.length === 0) return null;
    const months = data.monthly;
    const max = niceMax(Math.max(1, ...months.map((m) => m.totalIncome)));
    const band = PW / months.length;
    const bw = Math.min(38, band * 0.56);
    const segs: { key: keyof typeof SERIES; label: string }[] = [
      { key: 'square', label: 'Square' },
      { key: 'venmo', label: 'Venmo' },
      { key: 'cash', label: 'Cash' },
    ];
    return { months, max, band, bw, segs };
  }, [data]);

  // --- Chart 2: shows & sets grouped ---
  const activityChart = useMemo(() => {
    if (!data || data.monthly.length === 0) return null;
    const months = data.monthly;
    const max = niceMax(Math.max(1, ...months.map((m) => m.sets)));
    const band = PW / months.length;
    const gw = Math.min(40, band * 0.6);
    const bw = gw / 2 - 1.5;
    return { months, max, band, gw, bw };
  }, [data]);

  return (
    <div className="space-y-6" onMouseLeave={() => setTip(null)}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Year in Review</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">{error}</div>
      )}
      {loading && !data && <p className="text-sm text-[#E8E0D0]/50">Loading…</p>}

      {data && t && h && (
        <>
          {/* The season */}
          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-[#E8E0D0]/40">The season</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Shows" value={String(t.shows)} />
              <StatTile label="Bands" value={String(t.bands)} sub={`${t.repeatBands} played more than once`} />
              <StatTile label="Sets" value={String(t.sets)} sub={`${t.avgSetsPerShow.toFixed(1)} per show avg`} />
              <StatTile
                label="Attendance"
                value={t.totalAttendance > 0 ? t.totalAttendance.toLocaleString('en-US') : '—'}
                sub={
                  t.avgAttendance !== null
                    ? `${Math.round(t.avgAttendance)} avg · ${t.attendanceShowCount} shows`
                    : 'none recorded'
                }
              />
              <StatTile label="Tickets sold" value={String(t.ticketsSold)} sub={`${t.orders} online orders`} />
              <StatTile label="Ticket revenue" value={usd0(t.ticketRevenue)} sub="Square card sales" />
            </div>
          </section>

          {/* The money */}
          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-[#E8E0D0]/40">The money</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <StatTile label="Money in" value={usd0(t.totalIncome)} sub={`${t.settledShows} settled shows`} emphasis />
              <StatTile label="Paid to bands" value={usd0(t.bandPayout)} sub={pctOf(t.bandPayout, t.totalIncome)} />
              <StatTile label="Venue expenses" value={usd0(t.venueExpenses)} sub="excl. admin-help labor" />
              <StatTile label="Venue net" value={usd0(t.venueNet)} sub="before admin-help labor" />
            </div>
          </section>

          {/* Highlights */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-4">Highlights</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Highlight
                label="Biggest band payout"
                primary={h.biggestPayout ? usd0(h.biggestPayout.amount) : '—'}
                secondary={h.biggestPayout ? `${h.biggestPayout.title} · ${shortDate(h.biggestPayout.date)}` : undefined}
              />
              <Highlight
                label="Best attended"
                primary={h.bestAttended?.attendance ? String(h.bestAttended.attendance) : '—'}
                secondary={h.bestAttended ? `${h.bestAttended.title} · ${shortDate(h.bestAttended.date)}` : undefined}
              />
              <Highlight
                label="Most tickets, one night"
                primary={h.topTicketShow ? String(h.topTicketShow.tickets) : '—'}
                secondary={h.topTicketShow ? `${h.topTicketShow.title} · ${shortDate(h.topTicketShow.date)}` : undefined}
              />
              <Highlight
                label="Busiest weekend"
                primary={h.busiestWeekend ? `${h.busiestWeekend.shows} shows` : '—'}
                secondary={
                  h.busiestWeekend
                    ? `${shortDate(h.busiestWeekend.start)} – ${shortDate(h.busiestWeekend.end)}${
                        h.busiestWeekend.tickets > 0 ? ` · ${h.busiestWeekend.tickets} tix` : ''
                      }`
                    : undefined
                }
              />
            </div>
            {h.topRepeatBands.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[#E8E0D0]/10">
                <h3 className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-2">Repeat bands</h3>
                <div className="flex flex-wrap gap-2">
                  {h.topRepeatBands.map((b) => (
                    <span
                      key={b.name}
                      className="text-sm border border-[#E8E0D0]/20 rounded-full px-3 py-1 text-[#E8E0D0]/80"
                    >
                      {b.name} <span className="text-[#E8E0D0]/40 tabular-nums">×{b.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cardClass}>
              <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Money in, month by month</h2>
              <p className="text-xs text-[#E8E0D0]/40 mb-3">Settlement income by payment method</p>
              {incomeChart && (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monthly income by method">
                  <YGrid max={incomeChart.max} fmt={(v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`)} />
                  {incomeChart.months.map((m, i) => {
                    const cx = PAD.l + incomeChart.band * i + incomeChart.band / 2;
                    let acc = 0;
                    const rects = incomeChart.segs.map((s) => {
                      const val = m[`income${s.label}` as keyof Month] as number;
                      if (val <= 0) return null;
                      const hgt = (val / incomeChart.max) * PH;
                      const y = PAD.t + PH - ((acc + val) / incomeChart.max) * PH;
                      acc += val;
                      return (
                        <rect
                          key={s.key}
                          x={cx - incomeChart.bw / 2}
                          y={y}
                          width={incomeChart.bw}
                          height={Math.max(0.5, hgt)}
                          rx={2}
                          fill={SERIES[s.key]}
                          stroke="#2A2420"
                          strokeWidth={1.5}
                          onMouseMove={(e) =>
                            showTip(e, {
                              title: `${monthLabel(m.month)} · ${s.label}`,
                              lines: [
                                ['Amount', formatCurrency(val)],
                                ['Month total', formatCurrency(m.totalIncome)],
                              ],
                            })
                          }
                          onMouseLeave={() => setTip(null)}
                        />
                      );
                    });
                    const yTop = PAD.t + PH - (m.totalIncome / incomeChart.max) * PH;
                    return (
                      <g key={m.month}>
                        {rects}
                        {m.totalIncome > 0 && (
                          <text x={cx} y={yTop - 6} textAnchor="middle" className="tabular-nums" fill="#E8E0D0" opacity={0.7} fontSize={10} fontWeight={700}>
                            {usd0(m.totalIncome)}
                          </text>
                        )}
                        <text x={cx} y={H - 10} textAnchor="middle" fill="#E8E0D0" opacity={0.4} fontSize={11}>
                          {monthLabel(m.month)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <Legend items={[['Square', SERIES.square], ['Venmo', SERIES.venmo], ['Cash', SERIES.cash]]} />
            </div>

            <div className={cardClass}>
              <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Shows &amp; sets each month</h2>
              <p className="text-xs text-[#E8E0D0]/40 mb-3">Band slots booked across the season</p>
              {activityChart && (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Shows and sets per month">
                  <YGrid max={activityChart.max} fmt={(v) => String(v)} />
                  {activityChart.months.map((m, i) => {
                    const cx = PAD.l + activityChart.band * i + activityChart.band / 2;
                    const pairs: { val: number; color: string }[] = [
                      { val: m.shows, color: SERIES.square },
                      { val: m.sets, color: SERIES.venmo },
                    ];
                    return (
                      <g key={m.month}>
                        {pairs.map((p, si) => {
                          if (p.val <= 0) return null;
                          const hgt = (p.val / activityChart.max) * PH;
                          const x = cx - activityChart.gw / 2 + si * (activityChart.bw + 3);
                          const y = PAD.t + PH - hgt;
                          return (
                            <g key={si}>
                              <rect
                                x={x}
                                y={y}
                                width={activityChart.bw}
                                height={Math.max(0.5, hgt)}
                                rx={2}
                                fill={p.color}
                                onMouseMove={(e) =>
                                  showTip(e, {
                                    title: monthLabel(m.month),
                                    lines: [
                                      ['Shows', String(m.shows)],
                                      ['Sets', String(m.sets)],
                                    ],
                                  })
                                }
                                onMouseLeave={() => setTip(null)}
                              />
                              <text x={x + activityChart.bw / 2} y={y - 5} textAnchor="middle" className="tabular-nums" fill="#E8E0D0" opacity={0.7} fontSize={10} fontWeight={700}>
                                {p.val}
                              </text>
                            </g>
                          );
                        })}
                        <text x={cx} y={H - 10} textAnchor="middle" fill="#E8E0D0" opacity={0.4} fontSize={11}>
                          {monthLabel(m.month)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <Legend items={[['Shows', SERIES.square], ['Sets (band slots)', SERIES.venmo]]} />
            </div>
          </div>

          {/* Income split */}
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Where the money came from</h2>
            <IncomeSplit square={t.incomeSquare} venmo={t.incomeVenmo} cash={t.incomeCash} />
          </div>

          {/* Per-show table */}
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Every show</h2>
            {data.perShow.length === 0 ? (
              <p className="text-xs text-[#E8E0D0]/30">No shows in {year}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#E8E0D0]/40 border-b border-[#E8E0D0]/10">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Show</th>
                      <th className="py-2 pr-4 text-right">Bands</th>
                      <th className="py-2 pr-4 text-right">Tix</th>
                      <th className="py-2 pr-4 text-right">Att.</th>
                      <th className="py-2 pr-4 text-right">Income</th>
                      <th className="py-2 pr-4 text-right">To bands</th>
                      <th className="py-2 pr-4 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perShow.map((row) => (
                      <tr
                        key={row.showId}
                        onClick={() => router.push(`/admin/shows/${row.showId}/settlement`)}
                        className="border-b border-[#E8E0D0]/5 hover:bg-[#E8E0D0]/5 cursor-pointer"
                      >
                        <td className="py-2 pr-4 whitespace-nowrap text-[#E8E0D0]/60 tabular-nums">{shortDate(row.date)}</td>
                        <td className="py-2 pr-4 underline">{row.title}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.bands}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.ticketsSold || '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.attendance || '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.totalIncome ? formatCurrency(row.totalIncome) : '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.bandPayout ? formatCurrency(row.bandPayout) : '—'}</td>
                        <td
                          className={`py-2 pr-4 text-right tabular-nums font-semibold ${
                            row.venueNet > 0.005 ? 'text-green-400' : row.venueNet < -0.005 ? 'text-red-400' : ''
                          }`}
                        >
                          {formatCurrency(row.venueNet)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-[#E8E0D0]/30 leading-relaxed">
            Money figures reuse each show&rsquo;s settlement math (splits, guarantees, overrides). &ldquo;Ticket
            revenue&rdquo; is online Square card sales only; &ldquo;money in&rdquo; is total settlement income across all
            settled shows. Venue net is before admin-help labor.
          </p>
        </>
      )}

      {tip && (
        <div
          className="fixed z-50 pointer-events-none bg-[#1a1512] text-[#E8E0D0] rounded-md px-3 py-2 text-xs shadow-lg border border-[#E8E0D0]/15"
          style={{ left: tip.x + 14, top: tip.y + 14, maxWidth: 220 }}
        >
          <p className="font-semibold mb-1">{tip.rows.title}</p>
          {tip.rows.lines.map(([k, v]) => (
            <p key={k} className="flex justify-between gap-4 tabular-nums">
              <span className="text-[#E8E0D0]/50">{k}</span>
              <span>{v}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function pctOf(part: number, whole: number): string {
  if (whole <= 0) return '';
  return `${Math.round((part / whole) * 100)}% of income`;
}

function Highlight({ label, primary, secondary }: { label: string; primary: string; secondary?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{primary}</p>
      {secondary && <p className="text-xs text-[#E8E0D0]/50 mt-1 leading-snug">{secondary}</p>}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-xs text-[#E8E0D0]/70">
          <i className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function YGrid({ max, fmt }: { max: number; fmt: (v: number) => string }) {
  const lines = [];
  for (let i = 0; i <= 4; i++) {
    const val = (max / 4) * i;
    const y = PAD.t + PH - (val / max) * PH;
    lines.push(
      <g key={i}>
        <line x1={PAD.l} y1={y} x2={PAD.l + PW} y2={y} stroke="#E8E0D0" strokeOpacity={0.1} strokeWidth={1} />
        <text x={PAD.l - 7} y={y + 3.5} textAnchor="end" className="tabular-nums" fill="#E8E0D0" opacity={0.4} fontSize={10}>
          {fmt(val)}
        </text>
      </g>
    );
  }
  return <>{lines}</>;
}

function IncomeSplit({ square, venmo, cash }: { square: number; venmo: number; cash: number }) {
  const total = square + venmo + cash;
  if (total <= 0) return <p className="text-xs text-[#E8E0D0]/30">No income recorded.</p>;
  const rows: [string, number, string][] = [
    ['Square (online + door reader)', square, SERIES.square],
    ['Venmo', venmo, SERIES.venmo],
    ['Cash', cash, SERIES.cash],
  ];
  return (
    <>
      <div className="flex h-9 rounded overflow-hidden mb-3">
        {rows.map(([label, val, color]) => {
          const pct = (val / total) * 100;
          return (
            <div
              key={label}
              style={{ flexGrow: val, background: color }}
              className="flex items-center justify-center text-xs font-semibold text-white/90"
            >
              {pct >= 10 ? `${Math.round(pct)}%` : ''}
            </div>
          );
        })}
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, val, color]) => (
          <div key={label} className="flex items-center gap-2">
            <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
            <dt className="text-[#E8E0D0]/60">{label}</dt>
            <dd className="ml-auto tabular-nums font-semibold">{formatCurrency(val)}</dd>
            <dd className="tabular-nums text-[#E8E0D0]/40 w-10 text-right">{Math.round((val / total) * 100)}%</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
