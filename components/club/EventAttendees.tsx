'use client';

import { useState } from 'react';
import type { AttendeeCard } from '@/lib/club-events';

// Attendee profile cards for an event (avatar / name / bio / links). The roster
// auto-populates from members who signed up / marked "I went to this" — no
// admin add picker. The admin keeps a per-card remove control for moderation.
export default function EventAttendees({
  eventId,
  initialAttendees,
  isAdmin,
}: {
  eventId: number;
  initialAttendees: AttendeeCard[];
  isAdmin: boolean;
}) {
  const [attendees, setAttendees] = useState<AttendeeCard[]>(initialAttendees);
  const [error, setError] = useState<string | null>(null);

  async function remove(userId: number) {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    }
  }

  return (
    <div className="space-y-3">
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
                        onClick={() => remove(a.id)}
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
