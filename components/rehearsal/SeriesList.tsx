'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// A band's repeating bookings with "End series": on the band's booking page
// (paper look, respects the cancel cutoff) and the admin band page (dark
// look, no cutoff). Ending from a date cancels the sessions on or after it;
// "after the last booked session" just stops new dates being added.

export interface SeriesView {
  id: number;
  label: string; // "Weekly on Wednesdays · until ended"
  status: string;
  endsOn: string | null; // YYYY-MM-DD
  upcoming: string[]; // ISO starts of sessions still to come
}

const TZ = 'America/Chicago';
const dateOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const plainDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
};
const nextDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const LOOKS = {
  paper: {
    row: 'text-body-3 flex flex-col gap-2 border-b border-surface-ink/20 py-3',
    meta: 'opacity-70',
    link: 'hover:text-accent-red cursor-pointer underline underline-offset-4 disabled:opacity-40',
    select: 'bg-surface-paper text-surface-ink border-surface-ink border px-2 py-1',
    danger: 'bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-data-caption-13 cursor-pointer px-3 py-1 font-bold uppercase disabled:opacity-40',
    error: 'text-accent-red',
  },
  admin: {
    row: 'flex flex-col gap-2 border-b border-[#E8E0D0]/10 px-4 py-3 text-sm',
    meta: 'text-[#E8E0D0]/60',
    link: 'text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0] disabled:opacity-40',
    select: 'rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1 text-sm [color-scheme:dark]',
    danger: 'rounded border border-red-400/40 px-3 py-1 text-xs text-red-300 hover:border-red-300 disabled:opacity-40',
    error: 'text-red-300',
  },
} as const;

export default function SeriesList({
  series,
  endpoint,
  cutoffHours,
  look,
}: {
  series: SeriesView[];
  endpoint: string; // URL; '{id}' is replaced with the series id
  cutoffHours: number | null; // null = admin, no cutoff
  look: keyof typeof LOOKS;
}) {
  const router = useRouter();
  const s = LOOKS[look];
  const [open, setOpen] = useState<number | null>(null);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);

  if (series.length === 0) return null;

  function options(v: SeriesView) {
    const limit = cutoffHours === null ? 0 : Date.now() + cutoffHours * 3_600_000;
    const dates = [...new Set(v.upcoming.filter((iso) => new Date(iso).getTime() >= limit).map(dateOf))];
    const out = dates.map((d) => ({
      value: d,
      label: `From ${plainDay(d)} (cancels ${v.upcoming.filter((iso) => dateOf(iso) >= d).length})`,
    }));
    const last = v.upcoming.length ? dateOf(v.upcoming[v.upcoming.length - 1]) : null;
    const after = last ? nextDay(last) : new Date().toISOString().slice(0, 10);
    out.push({
      value: after,
      label: last ? `After ${plainDay(last)} — just stop adding new dates` : 'Now — stop adding new dates',
    });
    return out;
  }

  async function end(v: SeriesView) {
    if (!from) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint.replace('{id}', String(v.id)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: v.id, fromDate: from }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ id: v.id, ok: false, text: d?.error ?? 'That didn’t work — try again.' });
        return;
      }
      setMsg({ id: v.id, ok: true, text: `Ended. ${d.cancelled} session${d.cancelled === 1 ? '' : 's'} cancelled.` });
      setOpen(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ul>
      {series.map((v) => {
        const ended = v.status === 'ended';
        const opts = options(v);
        return (
          <li key={v.id} className={s.row}>
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-bold">↻ {v.label}</span>
              {ended ? (
                <span className={s.meta}>Ended{v.endsOn ? ` — nothing from ${plainDay(v.endsOn)}` : ''}</span>
              ) : (
                <span className={s.meta}>
                  {v.status === 'pending' ? 'Waiting for Alex' : 'Approved'}
                  {v.upcoming.length ? ` · next ${dayLabel(v.upcoming[0])}` : ''}
                </span>
              )}
              {!ended && open !== v.id && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(v.id);
                    setFrom(opts[0]?.value ?? '');
                    setMsg(null);
                  }}
                  className={`${s.link} ml-auto`}
                >
                  End series
                </button>
              )}
            </span>
            {open === v.id && (
              <span className="flex flex-wrap items-center gap-3">
                <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="End from" className={s.select}>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy || !from} onClick={() => end(v)} className={s.danger}>
                  {busy ? 'Ending…' : 'End series'}
                </button>
                <button type="button" onClick={() => setOpen(null)} className={s.link}>
                  Keep it
                </button>
                {cutoffHours !== null && (
                  <span className={s.meta}>Sessions less than {cutoffHours} hours away stay booked.</span>
                )}
              </span>
            )}
            {msg?.id === v.id && <span role="status" className={msg.ok ? s.meta : s.error}>{msg.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
