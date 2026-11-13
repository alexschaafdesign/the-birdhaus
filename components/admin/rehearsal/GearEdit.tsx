'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      <button type="button" onClick={() => setOpen(true)} className="text-left text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0]">
        {summary ? `Gear: ${summary}` : 'No gear'} <span className="underline">edit</span>
      </button>
    );
  }
  return (
    <div className="basis-full space-y-2 rounded border border-[#E8E0D0]/15 p-3 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {all.map((g) => (
          <label key={g} className="flex items-center gap-1.5">
            <input
              type="checkbox"
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
        className="w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1"
      />
      <div className="flex items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="rounded bg-[#E8E0D0] px-3 py-1 text-[#2A2420] disabled:opacity-40">
          {busy ? 'Saving…' : 'Save gear'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[#E8E0D0]/60 underline">
          cancel
        </button>
        {error && <span className="text-red-300">{error}</span>}
      </div>
    </div>
  );
}
