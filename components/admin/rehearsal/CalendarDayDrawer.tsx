'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// The admin Calendar's day drawer: what's on the day, its open stretches,
// "Add a rehearsal" (a band + time, confirmed straight away: future ones can
// email the band, past ones are a record and can be marked paid), and
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

const label = FORM.label;
const input = `${FIELD_INLINE} disabled:opacity-40`;

const pad = (n: number) => String(n).padStart(2, '0');
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

const PAID: Array<[string, string]> = [
  ['', 'Not yet'],
  ['venmo', 'Paid · Venmo'],
  ['cash', 'Paid · Cash'],
  ['square', 'Paid · Card'],
  ['comped', 'Comped'],
];

export default function CalendarDayDrawer({
  day,
  closeHref,
  bands,
  past,
}: {
  day: DrawerDay;
  closeHref: string;
  bands: Array<{ id: number; name: string }>;
  past: boolean; // the day is before today
}) {
  const router = useRouter();
  // Add a rehearsal
  const [bandId, setBandId] = useState('');
  const [rFrom, setRFrom] = useState('18:00');
  const [rTo, setRTo] = useState('21:00');
  const [rNote, setRNote] = useState('');
  const [sendEmail, setSendEmail] = useState(!past);
  const [paid, setPaid] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bandName = bands.find((b) => String(b.id) === bandId)?.name;

  async function addRehearsal(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) return setAddMsg({ ok: false, text: 'Pick a band.' });
    const when = `${clock(rFrom)}–${rTo === '00:00' ? 'midnight' : clock(rTo)}`;
    const emailing = sendEmail && !past;
    if (!confirm(`Add ${bandName}, ${day.title} ${when}${emailing ? ` and email ${bandName} the confirmation` : ''}?`)) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch('/api/admin/rehearsal/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandId: Number(bandId), date: day.date, from: rFrom, to: rTo, note: rNote, email: emailing, paid: paid || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setAddMsg({ ok: false, text: d?.error ?? "Didn't save." });
      const parts = [`Added ${d.catalogueId}.`];
      if (d.past) parts.push('Past session, so no email.');
      else if (emailing) parts.push(d.emailed ? `${bandName} emailed.` : 'The email did not go out — use Resend on Requests.');
      if (d.clash?.length) parts.push(`Heads up: ${d.clash.join(', ')}.`);
      setAddMsg({ ok: !d.clash?.length && (!emailing || d.emailed || d.past), text: parts.join(' ') });
      setRNote('');
      setPaid('');
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

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
      <Link href={closeHref} scroll={false} aria-label="Close" className="bg-surface-ink/60 fixed inset-0 z-40" />
      <aside
        role="dialog"
        aria-label={day.title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md space-y-5 overflow-y-auto border-l-2 border-surface-ink bg-surface-paper p-5 text-body-3"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h3 className={ADMIN_TYPE.heading}>{day.title}</h3>
          <Link href={closeHref} scroll={false} className={ADMIN_TYPE.link}>
            Close
          </Link>
        </div>

        <div className="space-y-1">
          <span className={label}>Open to bands</span>
          <p>{day.open.length ? day.open.join(' · ') : <span className="text-surface-ink/60">Nothing open</span>}</p>
        </div>

        {(day.shows.length > 0 || day.away !== null || day.busy.length > 0) && (
          <ul className="space-y-1">
            {day.shows.map((t) => (
              <li key={t} className="text-accent-red font-bold">Show: {t}</li>
            ))}
            {day.away !== null && <li className="text-surface-ink/70">Not available (Booking){day.away ? `: ${day.away}` : ''}</li>}
            {day.busy.map((t, i) => (
              <li key={i} className="border-spectrum-amber border-l-4 pl-2">Busy on your calendar: {t}</li>
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
                    className={`underline-offset-4 hover:underline ${b.conflict ? 'text-accent-red font-bold' : b.status === 'confirmed' ? '' : 'text-surface-ink/70'}`}
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
            <p className="text-surface-ink/60">None.</p>
          ) : (
            <ul className="space-y-1">
              {day.blocks.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3">
                  <span>
                    ■ {b.label}
                    {b.note && <span className="text-surface-ink/60"> · {b.note}</span>}
                  </span>
                  <button type="button" onClick={() => remove(b.id, b.multiDay)} className="text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={addRehearsal} className="space-y-3 border-2 border-surface-ink p-4">
          <span className={label}>Add a rehearsal</span>
          <select aria-label="Band" value={bandId} onChange={(e) => setBandId(e.target.value)} className={`${input} w-full`}>
            <option value="">Band…</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Start" value={rFrom} onChange={(e) => setRFrom(e.target.value)} className={input}>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {clock(t)}
                </option>
              ))}
            </select>
            <span>to</span>
            <select aria-label="End" value={rTo} onChange={(e) => setRTo(e.target.value)} className={input}>
              {[...TIMES.slice(1), '00:00'].map((t) => (
                <option key={t} value={t}>
                  {t === '00:00' ? 'midnight' : clock(t)}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder="Note (optional — shown with the booking)"
            maxLength={2000}
            value={rNote}
            onChange={(e) => setRNote(e.target.value)}
            className={`${input} w-full`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-surface-ink/70">Payment</span>
            <select aria-label="Payment" value={paid} onChange={(e) => setPaid(e.target.value)} className={input}>
              {PAID.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {past ? (
            <p className="text-surface-ink/60">A past session: saved as a record, no email.</p>
          ) : (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-surface-ink size-4" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email {bandName ?? 'the band'} the confirmation (address, calendar file)
            </label>
          )}
          <button type="submit" disabled={adding} className={buttonClassName('primary', 's')}>
            {adding ? 'Adding…' : 'Add rehearsal'}
          </button>
          {addMsg && (
            <p role={addMsg.ok ? 'status' : 'alert'} className={addMsg.ok ? FORM.notice : FORM.error}>
              {addMsg.text}
            </p>
          )}
        </form>

        <form onSubmit={block} className="space-y-3 border border-surface-ink p-4">
          <span className={label}>Block time</span>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-surface-ink size-4" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
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
            className={buttonClassName('primary', 's')}
          >
            {saving ? 'Blocking…' : 'Block time'}
          </button>
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? FORM.notice : FORM.error}>
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
