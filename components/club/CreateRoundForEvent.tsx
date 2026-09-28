'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only, shown on an event that isn't collecting songs yet: one click
// creates the event's (locked, uploads-closed) playlist and links it, so
// members can then upload here once the admin opens uploads. The playlist is
// titled after the event — the admin never has to think about "rounds".
export default function CreateRoundForEvent({
  eventId,
  defaultTitle,
}: {
  eventId: number;
  defaultTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/club/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: defaultTitle, eventId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't enable (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't enable song uploads");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="rounded-lg border border-dashed border-[#c8a26a]/40 px-4 py-3 text-sm text-[#c8a26a]/90 transition hover:border-[#c8a26a]/70 hover:bg-[#c8a26a]/[0.06] disabled:opacity-50"
      >
        {busy ? 'Enabling…' : 'Enable song uploads for this event'}
      </button>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
