'use client';

import { useState } from 'react';
import type { EventSignup } from '@/lib/club-events';
import type { ClubGroup } from '@/lib/club-groups';
import type { DaysOpenDefault } from '@/lib/song-club';

const DAYS_OPEN_LABELS: Array<{ value: DaysOpenDefault; label: string }> = [
  { value: 'current', label: 'Current day only' },
  { value: 'current_and_previous', label: 'Current + previous day' },
  { value: 'all', label: 'All days so far' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Admin sign-ups roster for an online event — and, for grouped song-a-days,
// the group assignment panel: create the groups, assign each attendee via a
// per-row dropdown, and "distribute unassigned" as late signups arrive
// (it never reshuffles anyone already assigned). Removal hits the shared
// attendees endpoint; two-click confirm — first click arms, second removes.
export default function EventSignupsTable({
  eventId,
  initialSignups,
  initialGroups = [],
  initialDaysOpen = 'current',
}: {
  eventId: number;
  initialSignups: EventSignup[];
  initialGroups?: ClubGroup[];
  initialDaysOpen?: DaysOpenDefault;
}) {
  const [signups, setSignups] = useState<EventSignup[]>(initialSignups);
  const [groups, setGroups] = useState<ClubGroup[]>(initialGroups);
  const [daysOpen, setDaysOpen] = useState<DaysOpenDefault>(initialDaysOpen);
  const [createCount, setCreateCount] = useState('4');
  const [armedId, setArmedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [groupsBusy, setGroupsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unassignedCount = signups.filter((s) => s.groupId === null).length;

  async function patchGroups(payload: Record<string, unknown>) {
    setGroupsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/song-club/${eventId}/groups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't update groups (${res.status})`);
      setGroups(data.groups ?? []);
      if (Array.isArray(data.assignments)) {
        const byUser = new Map<number, number | null>(
          data.assignments.map((a: { userId: number; groupId: number | null }) => [
            a.userId,
            a.groupId,
          ])
        );
        setSignups((prev) =>
          prev.map((s) => (byUser.has(s.id) ? { ...s, groupId: byUser.get(s.id) ?? null } : s))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update groups");
    } finally {
      setGroupsBusy(false);
    }
  }

  async function saveDaysOpen(value: DaysOpenDefault) {
    const previous = daysOpen;
    setDaysOpen(value);
    setError(null);
    try {
      const res = await fetch(`/api/admin/song-club/${eventId}/groups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysOpen: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      }
    } catch (e) {
      setDaysOpen(previous);
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

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

  return (
    <>
      {/* Groups — create once, then keep assignments balanced. */}
      <section className="mb-6 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Groups
        </h3>
        {groups.length === 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm text-[#E8E0D0]/70" htmlFor="group-count">
              Split this event into
            </label>
            <select
              id="group-count"
              value={createCount}
              onChange={(e) => setCreateCount(e.target.value)}
              className="rounded border border-[#E8E0D0]/25 bg-transparent px-2 py-1.5 text-sm"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n} className="bg-[#2A2420]">
                  {n} groups
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => patchGroups({ create: { count: Number(createCount) } })}
              disabled={groupsBusy}
              className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:opacity-50"
            >
              {groupsBusy ? 'Creating…' : 'Create groups'}
            </button>
          </div>
        ) : (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="rounded-full border border-[#c8a26a]/40 bg-[#c8a26a]/10 px-3 py-1 text-sm"
                >
                  {g.name} · {g.memberCount}
                </li>
              ))}
              {unassignedCount > 0 && (
                <li className="rounded-full border border-[#E8E0D0]/20 px-3 py-1 text-sm text-[#E8E0D0]/60">
                  Unassigned · {unassignedCount}
                </li>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => patchGroups({ distribute: true })}
                disabled={groupsBusy || unassignedCount === 0}
                className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:opacity-50"
              >
                {groupsBusy ? 'Working…' : `Distribute ${unassignedCount} unassigned evenly`}
              </button>
              <span className="text-xs text-[#E8E0D0]/45">
                Only touches unassigned people — safe to re-run as signups arrive.
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#E8E0D0]/10 pt-3">
              <label className="text-sm text-[#E8E0D0]/70" htmlFor="days-open">
                Days open by default
              </label>
              <select
                id="days-open"
                value={daysOpen}
                onChange={(e) => saveDaysOpen(e.target.value as DaysOpenDefault)}
                className="rounded border border-[#E8E0D0]/25 bg-transparent px-2 py-1.5 text-sm"
              >
                {DAYS_OPEN_LABELS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#2A2420]">
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[#E8E0D0]/45">
                Earlier days collapse to a header; viewers can still open any day themselves.
              </span>
            </div>
          </>
        )}
      </section>

      {error && (
        <div className="mb-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      {signups.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No sign-ups yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/15 text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                {groups.length > 0 && <th className="py-2 pr-4 font-medium">Group</th>}
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
                  {groups.length > 0 && (
                    <td className="py-2 pr-4">
                      <select
                        value={s.groupId ?? ''}
                        onChange={(e) =>
                          patchGroups({
                            assign: {
                              userId: s.id,
                              groupId: e.target.value ? Number(e.target.value) : null,
                            },
                          })
                        }
                        disabled={groupsBusy}
                        className={`rounded border bg-transparent px-2 py-1 text-sm ${
                          s.groupId === null
                            ? 'border-[#c8a26a]/60 text-[#c8a26a]'
                            : 'border-[#E8E0D0]/25'
                        }`}
                      >
                        <option value="" className="bg-[#2A2420]">
                          — unassigned —
                        </option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id} className="bg-[#2A2420]">
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
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
      )}
    </>
  );
}
