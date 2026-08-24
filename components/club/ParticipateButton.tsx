'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// "I participated in this" — instantly unlocks the event for the member
// (adds them to the roster), then refreshes to reveal the round + chat.
export default function ParticipateButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function participate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/events/${eventId}/participate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't unlock (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlock");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={participate}
        disabled={busy}
        className="rounded-md bg-[#E8E0D0] px-5 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
      >
        {busy ? 'Unlocking…' : 'I participated in this — unlock'}
      </button>
      {error && <p className="mt-2 text-sm text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
