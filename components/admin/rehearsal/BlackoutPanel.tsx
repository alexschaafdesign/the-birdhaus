'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// Add / remove rehearsal blackouts. Adding one over a confirmed booking flags
// it (never cancels) and lists it here so Alex can get in touch.

const input = `${FIELD_INLINE} disabled:opacity-40`;

export default function BlackoutPanel({ blackouts }: { blackouts: Array<{ id: number; label: string; note: string }> }) {
  const router = useRouter();
  const [f, setF] = useState({ fromDate: '', toDate: '', allDay: true, fromTime: '18:00', toTime: '21:00', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/rehearsal/blackouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, toDate: f.toDate || f.fromDate }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setMsg({ ok: false, text: d?.error ?? 'Didn’t save' });
      setMsg(
        d.conflicts.length
          ? { ok: false, text: `Added. It lands on confirmed booking(s) — flagged, not cancelled: ${d.conflicts.join('; ')}` }
          : { ok: true, text: 'Blocked.' },
      );
      setF({ ...f, note: '' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Remove this block?')) return;
    await fetch(`/api/admin/rehearsal/blackouts/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className={ADMIN_TYPE.heading}>Block a date range</h2>
      <p className="text-body-3 text-surface-ink/60">For one day, click the date on the calendar instead.</p>
      <form onSubmit={add} className="text-body-3 flex flex-wrap items-end gap-3 border border-surface-ink p-4">
        <label className="space-y-1">
          <span className={FORM.label}>From</span>
          <input required type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} className={input} />
        </label>
        <label className="space-y-1">
          <span className={FORM.label}>To</span>
          <input type="date" value={f.toDate} min={f.fromDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} className={input} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2.5">
          <input type="checkbox" className="accent-surface-ink size-4" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />
          All day
        </label>
        {!f.allDay && (
          <>
            <input type="time" step={900} value={f.fromTime} onChange={(e) => setF({ ...f, fromTime: e.target.value })} aria-label="Start time" className={input} />
            <span className="pb-2.5">to</span>
            <input type="time" step={900} value={f.toTime} onChange={(e) => setF({ ...f, toTime: e.target.value })} aria-label="End time" className={input} />
          </>
        )}
        <input placeholder="Note (only you see it)" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={`${input} min-w-48 flex-1`} />
        <button type="submit" disabled={busy} className={buttonClassName('primary', 's')}>
          {busy ? 'Adding…' : 'Block'}
        </button>
      </form>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? FORM.notice : FORM.error}>
          {msg.text}
        </p>
      )}
      {blackouts.length === 0 ? (
        <p className="text-body-3 text-surface-ink/60">No blackouts in these weeks.</p>
      ) : (
        <ul className="divide-y divide-surface-ink/20 border border-surface-ink text-body-3">
          {blackouts.map((b) => (
            <li key={b.id} className="flex items-center gap-4 px-4 py-2">
              <span className="font-bold">{b.label}</span>
              {b.note && <span className="text-surface-ink/60">{b.note}</span>}
              <button type="button" onClick={() => remove(b.id)} className="ml-auto text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline disabled:opacity-40">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
