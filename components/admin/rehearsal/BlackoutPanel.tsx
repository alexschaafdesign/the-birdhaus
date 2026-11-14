'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Add / remove rehearsal blackouts. Adding one over a confirmed booking flags
// it (never cancels) and lists it here so Alex can get in touch.

const input =
  'rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1 text-sm focus:outline-none focus:border-[#E8E0D0]/60 [color-scheme:dark]';

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
      <h2 className="text-xl font-bold">Block a date range</h2>
      <p className="text-sm text-[#E8E0D0]/55">For one day, click the date on the calendar instead.</p>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-lg border border-[#E8E0D0]/15 p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">From</span>
          <input required type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">To</span>
          <input type="date" value={f.toDate} min={f.fromDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} className={input} />
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />
          All day
        </label>
        {!f.allDay && (
          <>
            <input type="time" step={900} value={f.fromTime} onChange={(e) => setF({ ...f, fromTime: e.target.value })} aria-label="Start time" className={input} />
            <span className="pb-1.5">to</span>
            <input type="time" step={900} value={f.toTime} onChange={(e) => setF({ ...f, toTime: e.target.value })} aria-label="End time" className={input} />
          </>
        )}
        <input placeholder="Note (only you see it)" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={`${input} min-w-48 flex-1`} />
        <button type="submit" disabled={busy} className="rounded bg-[#E8E0D0] px-4 py-1.5 text-[#2A2420] hover:bg-[#E8E0D0]/90 disabled:opacity-50">
          {busy ? 'Adding…' : 'Block'}
        </button>
      </form>
      {msg && (
        <p className={`rounded border px-4 py-2 text-sm ${msg.ok ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/40 bg-red-400/10 text-red-300'}`}>
          {msg.text}
        </p>
      )}
      {blackouts.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No blackouts in these weeks.</p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15 text-sm">
          {blackouts.map((b) => (
            <li key={b.id} className="flex items-center gap-4 px-4 py-2">
              <span className="font-medium">{b.label}</span>
              {b.note && <span className="text-[#E8E0D0]/60">{b.note}</span>}
              <button type="button" onClick={() => remove(b.id)} className="ml-auto text-xs text-red-300/80 underline hover:text-red-300">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
