'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// The master Calendar's day drawer: this day's blocks (remove) and "Block
// time" (all day — optionally through a later date — or from/to, with a
// private note). The only place blocks are added or removed; they close the
// time for rehearsals and, all day, for shows. A block over a confirmed
// rehearsal flags it, never cancels it.

const input = `${FIELD_INLINE} disabled:opacity-40`;
const pad = (n: number) => String(n).padStart(2, '0');
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

function nextDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface DayBlock {
  id: number;
  label: string; // "all day" / "4–10pm"
  note: string;
  multiDay: boolean;
}

export default function BlockEditor({ date, blocks }: { date: string; blocks: DayBlock[] }) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(true);
  const [through, setThrough] = useState(date);
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
        // "to midnight" = the next day's 00:00.
        body: JSON.stringify(
          allDay
            ? { fromDate: date, toDate: through < date ? date : through, allDay: true, note }
            : to === '00:00'
              ? { fromDate: date, toDate: nextDay(date), allDay: false, fromTime: from, toTime: '00:00', note }
              : { fromDate: date, toDate: date, allDay: false, fromTime: from, toTime: to, note },
        ),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error ?? "Didn't save." });
      setMsg(
        d.conflicts?.length
          ? { ok: false, text: `Blocked. It overlaps confirmed rehearsal(s) — flagged, not cancelled: ${d.conflicts.join('; ')}` }
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
    const res = await fetch(`/api/admin/rehearsal/blackouts/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) setMsg({ ok: false, text: "Didn't remove it — try again." });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {blocks.length > 0 && (
        <ul className="space-y-1">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3">
              <span>
                ■ {b.label}
                {b.multiDay && <span className="text-surface-ink/60"> (several days)</span>}
                {b.note && <span className="text-surface-ink/60"> · {b.note}</span>}
              </span>
              <button
                type="button"
                onClick={() => remove(b.id, b.multiDay)}
                className="text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={block} className="space-y-3 border border-surface-ink p-4">
        <span className={FORM.label}>Block time</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-surface-ink size-4" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>
        {allDay ? (
          <label className="flex flex-wrap items-center gap-2">
            <span>through</span>
            <input type="date" value={through} min={date} onChange={(e) => setThrough(e.target.value || date)} className={input} />
          </label>
        ) : (
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
          placeholder="Private note (optional), e.g. Out of town"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${input} w-full`}
        />
        <button type="submit" disabled={saving} className={buttonClassName('primary', 's')}>
          {saving ? 'Blocking…' : 'Block'}
        </button>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? FORM.notice : FORM.error}>
            {msg.text}
          </p>
        )}
      </form>
    </div>
  );
}
