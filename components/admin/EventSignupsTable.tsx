'use client';

import { useState } from 'react';
import type { EventSignup } from '@/lib/club-events';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Admin sign-ups roster for an online event, with a per-row remove control.
// Removal hits the shared attendees endpoint (admin-only); on success the row
// is dropped locally. Two-click confirm — first click arms, second removes.
export default function EventSignupsTable({
  eventId,
  initialSignups,
}: {
  eventId: number;
  initialSignups: EventSignup[];
}) {
  const [signups, setSignups] = useState<EventSignup[]>(initialSignups);
  const [armedId, setArmedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(userId: number) {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/club/events/${eventId}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't remove (${res.status})`);
      }
      setSignups((prev) => prev.filter((s) => s.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    } finally {
      setBusyId(null);
      setArmedId(null);
    }
  }

  if (signups.length === 0) {
    return <p className="text-sm text-[#E8E0D0]/50">No sign-ups yet.</p>;
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#E8E0D0]/15 text-xs uppercase tracking-wide text-[#E8E0D0]/45">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Signed up</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E0D0]/10">
            {signups.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4 text-[#E8E0D0]/70">
                  <a href={`mailto:${s.email}`} className="hover:text-[#E8E0D0]">
                    {s.email}
                  </a>
                </td>
                <td className="py-2 pr-4 text-[#E8E0D0]/60">{formatDateTime(s.added_at)}</td>
                <td className="py-2 text-right">
                  {armedId === s.id ? (
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        disabled={busyId === s.id}
                        className="font-medium text-[#F5A3A3] disabled:opacity-50"
                      >
                        {busyId === s.id ? 'Removing…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setArmedId(null)}
                        className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setArmedId(s.id)}
                      className="text-[#E8E0D0]/50 transition hover:text-[#F5A3A3]"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
