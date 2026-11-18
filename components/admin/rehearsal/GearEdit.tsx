'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// Inline gear editor for one session (admin band page history).
export default function GearEdit({
  id,
  options,
  gearNeeded,
  gearNotes,
}: {
  id: number;
  options: string[];
  gearNeeded: string[];
  gearNotes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(gearNeeded);
  const [notes, setNotes] = useState(gearNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep labels this booking already has even if they left the house list.
  const all = [...options, ...gearNeeded.filter((g) => !options.includes(g))];
  const summary = [gearNeeded.join(', '), gearNotes].filter(Boolean).join(' — ');

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/rehearsal/bookings/${id}/gear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gearNeeded: picked, gearNotes: notes }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? 'Didn’t save');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-left text-data-caption-13 text-surface-ink/60 cursor-pointer hover:text-accent-red">
        {summary ? `Gear: ${summary}` : 'No gear'} <span className="underline">edit</span>
      </button>
    );
  }
  return (
    <div className="basis-full space-y-2 border border-surface-ink p-3 text-data-caption-13">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {all.map((g) => (
          <label key={g} className="flex items-center gap-1.5">
            <input
              type="checkbox" className="accent-surface-ink size-4"
              checked={picked.includes(g)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, g] : picked.filter((x) => x !== g))}
            />
            {g}
          </label>
        ))}
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
        placeholder="Gear notes"
        className={FORM.field}
      />
      <div className="flex items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className={buttonClassName('primary', 's')}>
          {busy ? 'Saving…' : 'Save gear'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ADMIN_TYPE.link}>
          Cancel
        </button>
        {error && <span role="alert" className={FORM.error}>{error}</span>}
      </div>
    </div>
  );
}
