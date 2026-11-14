'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// The admin Calendar's day drawer: what's on the day, its open stretches, and
// "Block time" (from/to or all day, private note) which saves a blackout.
// A block over a confirmed booking flags it — never cancels it.

export interface DrawerDay {
  date: string; // YYYY-MM-DD
  title: string; // "Wednesday 18 November"
  open: string[]; // "10am–5:30pm"
  shows: string[];
  away: string | null; // Not available (Booking) note, '' = no note
  busy: string[];
  blocks: Array<{ id: number; label: string; note: string; multiDay: boolean }>;
  bookings: Array<{ id: number; bandId: number; label: string; status: string; conflict: boolean }>;
}

const label = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/60';
const input =
  'rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1 text-sm focus:outline-none focus:border-[#E8E0D0]/60 [color-scheme:dark]';

const pad = (n: number) => String(n).padStart(2, '0');
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

export default function CalendarDayDrawer({ day, closeHref }: { day: DrawerDay; closeHref: string }) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState('16:00');
  const [to, setTo] = useState('22:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function block(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/rehearsal/blackouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // "to 12am" = midnight: the next day's 00:00.
        body: JSON.stringify(
          allDay
            ? { fromDate: day.date, toDate: day.date, allDay: true, note }
            : to === '00:00'
              ? { fromDate: day.date, toDate: nextDay(day.date), allDay: false, fromTime: from, toTime: '00:00', note }
              : { fromDate: day.date, toDate: day.date, allDay: false, fromTime: from, toTime: to, note },
        ),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error ?? "Didn't save." });
      setMsg(
        d.conflicts.length
          ? { ok: false, text: `Blocked. It overlaps confirmed booking(s) — flagged, not cancelled: ${d.conflicts.join('; ')}` }
          : { ok: true, text: 'Blocked.' },
      );
      setNote('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number, multiDay: boolean) {
    if (!confirm(multiDay ? 'Remove this block? It covers more than this day — all of it goes.' : 'Remove this block?')) return;
    await fetch(`/api/admin/rehearsal/blackouts/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close" className="fixed inset-0 z-40 bg-black/50" />
      <aside
        role="dialog"
        aria-label={day.title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md space-y-5 overflow-y-auto border-l border-[#E8E0D0]/20 bg-[#1d1916] p-5 text-sm"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-lg font-bold">{day.title}</h3>
          <Link href={closeHref} scroll={false} className="text-[#E8E0D0]/60 underline hover:text-[#E8E0D0]">
            Close
          </Link>
        </div>

        <div className="space-y-1">
          <span className={label}>Open to bands</span>
          <p>{day.open.length ? day.open.join(' · ') : <span className="text-[#E8E0D0]/50">Nothing open</span>}</p>
        </div>

        {(day.shows.length > 0 || day.away !== null || day.busy.length > 0) && (
          <ul className="space-y-1">
            {day.shows.map((t) => (
              <li key={t} className="text-red-200">Show: {t}</li>
            ))}
            {day.away !== null && <li className="text-[#E8E0D0]/70">Not available (Booking){day.away ? `: ${day.away}` : ''}</li>}
            {day.busy.map((t, i) => (
              <li key={i} className="text-amber-200/80">Busy on your calendar: {t}</li>
            ))}
          </ul>
        )}

        {day.bookings.length > 0 && (
          <div className="space-y-1">
            <span className={label}>Bookings</span>
            <ul className="space-y-1">
              {day.bookings.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/rehearsal/bands/${b.bandId}`}
                    className={`hover:underline ${b.conflict ? 'text-red-200' : b.status === 'confirmed' ? 'text-emerald-200' : 'text-amber-200'}`}
                  >
                    {b.conflict ? '⚠ ' : ''}
                    {b.label} · {b.status}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <span className={label}>Blocks</span>
          {day.blocks.length === 0 ? (
            <p className="text-[#E8E0D0]/50">None.</p>
          ) : (
            <ul className="space-y-1">
              {day.blocks.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3">
                  <span>
                    ■ {b.label}
                    {b.note && <span className="text-[#E8E0D0]/60"> · {b.note}</span>}
                  </span>
                  <button type="button" onClick={() => remove(b.id, b.multiDay)} className="text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0]">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={block} className="space-y-3 rounded-lg border border-[#E8E0D0]/15 p-4">
          <span className={label}>Block time</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay && (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={input}>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {clock(t)}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={input}>
                {[...TIMES.slice(1), '00:00'].map((t) => (
                  <option key={t} value={t}>
                    {t === '00:00' ? 'midnight' : clock(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            placeholder="Private note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${input} w-full`}
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-[#2A2420] hover:bg-[#E8E0D0]/90 disabled:opacity-50"
          >
            {saving ? 'Blocking…' : 'Block time'}
          </button>
          {msg && (
            <p className={`rounded border px-3 py-2 ${msg.ok ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/40 bg-red-400/10 text-red-300'}`}>
              {msg.text}
            </p>
          )}
        </form>
      </aside>
    </>
  );
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
