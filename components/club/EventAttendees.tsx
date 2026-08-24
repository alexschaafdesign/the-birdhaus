'use client';

import { useState } from 'react';
import type { AttendeeCard } from '@/lib/club-events';

// Attendee profile cards for an event (avatar / name / bio / links). Admins
// get an add picker (from members not yet on the roster) and a remove control
// per card.
export default function EventAttendees({
  eventId,
  initialAttendees,
  addableMembers,
  isAdmin,
}: {
  eventId: number;
  initialAttendees: AttendeeCard[];
  addableMembers: Array<{ id: number; name: string; email: string }>;
  isAdmin: boolean;
}) {
  const [attendees, setAttendees] = useState<AttendeeCard[]>(initialAttendees);
  const [addable, setAddable] = useState(addableMembers);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/events/${eventId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(pick) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't add (${res.status})`);
      setAttendees(data.attendees ?? []);
      setAddable((prev) => prev.filter((m) => m.id !== Number(pick)));
      setPick('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number, name: string) {
    setError(null);
    try {
      const res = await fetch(`/api/club/events/${eventId}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't remove (${res.status})`);
      setAttendees(data.attendees ?? []);
      setAddable((prev) =>
        prev.some((m) => m.id === userId) ? prev : [...prev, { id: userId, name, email: '' }]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    }
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-1.5 text-sm text-[#E8E0D0] focus:border-[#E8E0D0]/50 focus:outline-none"
          >
            <option value="">Add someone who came…</option>
            {addable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={busy || !pick}
            className="rounded-md border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      {attendees.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/40">No attendees listed yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {attendees.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.05]">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-[#E8E0D0]/40">
                      {a.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-[#E8E0D0]">{a.name}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => remove(a.id, a.name)}
                        className="shrink-0 text-[10px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                      >
                        remove
                      </button>
                    )}
                  </div>
                  {a.bio && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-[#E8E0D0]/65">{a.bio}</p>
                  )}
                  {a.links.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {a.links.map((l, i) => (
                        <a
                          key={i}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#c8a26a]/90 underline-offset-2 hover:text-[#c8a26a] hover:underline"
                        >
                          {l.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
