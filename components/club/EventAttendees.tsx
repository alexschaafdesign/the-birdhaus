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
  uploadDays = null,
  totalDays = 0,
  daysElapsed = 0,
}: {
  eventId: number;
  initialAttendees: AttendeeCard[];
  isAdmin: boolean;
  // Song-a-day completion: distinct days uploaded per user id, the event's
  // total days, and how many days have elapsed. null → no badges (single-day
  // event, no round, or the event hasn't started).
  uploadDays?: Record<number, number> | null;
  totalDays?: number;
  daysElapsed?: number;
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
          {attendees.map((a) => {
            // Completion badge state. `complete` = uploaded on every day of
            // the event (the 10/10 flourish); `perfect` = gapless up to today
            // but the event's still running (an active streak).
            const showBadge = uploadDays !== null && totalDays > 1 && daysElapsed >= 1;
            const days = uploadDays?.[a.id] ?? 0;
            const complete = showBadge && days >= totalDays;
            const perfect = showBadge && !complete && days > 0 && days >= daysElapsed;
            return (
            <div
              key={a.id}
              className={`rounded-lg border p-3 ${
                complete
                  ? 'border-[#c8a26a]/60 bg-[#c8a26a]/[0.07] ring-1 ring-[#c8a26a]/40'
                  : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]'
              }`}
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
                    <span className="flex shrink-0 items-baseline gap-2">
                      {showBadge && (
                        <span
                          title={
                            complete
                              ? `Uploaded all ${totalDays} days — a full song-a-day!`
                              : perfect
                                ? `Uploaded every day so far (${days}/${totalDays}) — on a streak!`
                                : `Uploaded ${days} of ${totalDays} days`
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                            complete
                              ? 'bg-[#c8a26a]/20 text-[#c8a26a] ring-1 ring-inset ring-[#c8a26a]/50'
                              : perfect
                                ? 'bg-[#c8a26a]/15 text-[#c8a26a]'
                                : 'bg-[#E8E0D0]/[0.08] text-[#E8E0D0]/50'
                          }`}
                        >
                          {complete && <span aria-hidden>🏆</span>}
                          {perfect && <span aria-hidden>🔥</span>}
                          {days}/{totalDays}
                        </span>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          className="text-[11px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                        >
                          remove
                        </button>
                      )}
                    </span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
