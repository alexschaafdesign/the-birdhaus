'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only, shown on an event hub that has no round yet: create a round and
// link it to this event in one step, so members can then upload to it here.
export default function CreateRoundForEvent({
  eventId,
  defaultTitle,
}: {
  eventId: number;
  defaultTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/club/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, eventId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't create (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 rounded-lg border border-dashed border-[#c8a26a]/40 px-4 py-3 text-sm text-[#c8a26a]/90 transition hover:border-[#c8a26a]/70 hover:bg-[#c8a26a]/[0.06]"
      >
        + Create a round for this event
      </button>
    );
  }

  return (
    <form
      onSubmit={create}
      className="mt-6 space-y-2 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.06] p-4"
    >
      <label className="block text-xs font-medium uppercase tracking-wide text-[#c8a26a]/80">
        Round title
      </label>
      <input
        type="text"
        required
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] focus:border-[#E8E0D0]/50 focus:outline-none"
      />
      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create round'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
