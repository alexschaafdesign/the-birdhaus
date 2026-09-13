'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventSignup } from '@/lib/club-events';
import type { ClubGroup } from '@/lib/club-groups';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function byName(a: EventSignup, b: EventSignup): number {
  return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
}

// A column's key: 'unassigned', or a group id. null groupId == Unassigned.
type ColKey = { label: string; groupId: number | null };

// Admin group-assignment board for an online event: one column per group plus
// Unassigned, attendees as chips you drag between columns (or move via each
// chip's ⋯ menu — the keyboard/touch path). Moves are optimistic and saved per
// person through the existing assign endpoint; a failed save snaps the chip
// back with an inline error. A collapsed List view below mirrors the old table.
export default function EventSignupsTable({
  eventId,
  initialSignups,
  initialGroups = [],
}: {
  eventId: number;
  initialSignups: EventSignup[];
  initialGroups?: ClubGroup[];
}) {
  const [signups, setSignups] = useState<EventSignup[]>(initialSignups);
  const [groups, setGroups] = useState<ClubGroup[]>(initialGroups);
  const [createCount, setCreateCount] = useState('4');
  const [groupsBusy, setGroupsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chipErrors, setChipErrors] = useState<Record<number, string>>({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const unassignedCount = signups.filter((s) => s.groupId === null).length;

  const columns: ColKey[] = [
    { label: 'Unassigned', groupId: null },
    ...[...groups]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ label: g.name, groupId: g.id })),
  ];
  const colKey = (groupId: number | null) => (groupId === null ? 'unassigned' : `g-${groupId}`);
  const groupName = (groupId: number | null) =>
    groupId === null ? 'Unassigned' : (groups.find((g) => g.id === groupId)?.name ?? 'a group');

  function setChipError(id: number, message: string | null) {
    setChipErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  // Shared multi-shape endpoint (create / distribute / delete group). Refreshes
  // groups + assignments from the response.
  async function patchGroups(payload: Record<string, unknown>): Promise<boolean> {
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
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update groups");
      return false;
    } finally {
      setGroupsBusy(false);
    }
  }

  // Move one person to a column. Optimistic; the assign endpoint saves per
  // person. On failure, snap back and show the error on that chip.
  async function assignPerson(userId: number, groupId: number | null) {
    setOpenMenuId(null);
    const current = signups.find((s) => s.id === userId);
    if (!current || current.groupId === groupId) return;
    const previous = current.groupId;
    setChipError(userId, null);
    setSignups((prev) => prev.map((s) => (s.id === userId ? { ...s, groupId } : s)));
    try {
      const res = await fetch(`/api/admin/song-club/${eventId}/groups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assign: { userId, groupId } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't move (${res.status})`);
      }
    } catch (e) {
      setSignups((prev) => prev.map((s) => (s.id === userId ? { ...s, groupId: previous } : s)));
      setChipError(userId, e instanceof Error ? e.message : "Couldn't move — try again");
    }
  }

  function removeGroup(group: ClubGroup) {
    const count = signups.filter((s) => s.groupId === group.id).length;
    const members = count === 1 ? '1 member becomes' : `${count} members become`;
    if (
      !confirm(
        `Remove ${group.name}? Its ${members} unassigned and their songs move to the ` +
          `Unassigned section. Nothing is deleted.`
      )
    ) {
      return;
    }
    void patchGroups({ deleteGroupId: group.id });
  }

  async function removeAttendee(userId: number) {
    const person = signups.find((s) => s.id === userId);
    setOpenMenuId(null);
    if (!person) return;
    if (!confirm(`Remove ${person.name} from this event? This can't be undone.`)) return;
    setRemovingId(userId);
    setChipError(userId, null);
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
      setChipError(userId, e instanceof Error ? e.message : "Couldn't remove");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      {/* Above the board: create the groups (none yet) or top up assignments. */}
      <section className="mb-4 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
        {groups.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => patchGroups({ distribute: true })}
              disabled={groupsBusy || unassignedCount === 0}
              className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-sm font-medium text-[#2A2420] transition hover:bg-[#E8E0D0]/90 disabled:opacity-50"
            >
              {groupsBusy ? 'Working…' : `Distribute ${unassignedCount} unassigned evenly`}
            </button>
            <span className="text-xs text-[#E8E0D0]/45">
              Only touches unassigned people — safe to re-run as sign-ups arrive.
            </span>
          </div>
        )}
      </section>

      {error && (
        <div className="mb-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* The board. Columns wrap on narrow screens rather than scrolling. */}
      <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {columns.map((col) => {
          const people = signups.filter((s) => s.groupId === col.groupId).sort(byName);
          const isOver = dragOverCol === colKey(col.groupId);
          const group = col.groupId === null ? null : groups.find((g) => g.id === col.groupId);
          return (
            <div
              key={colKey(col.groupId)}
              data-col={colKey(col.groupId)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(colKey(col.groupId));
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol((c) => (c === colKey(col.groupId) ? null : c));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData('text/plain'));
                setDragOverCol(null);
                setDraggingId(null);
                if (Number.isInteger(id)) void assignPerson(id, col.groupId);
              }}
              className={`flex min-h-[120px] flex-col rounded-lg border p-2 transition ${
                isOver
                  ? 'border-[#c8a26a] bg-[#c8a26a]/10'
                  : 'border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.02]'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="min-w-0 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/60">
                  <span className="truncate">{col.label}</span>{' '}
                  <span className="text-[#E8E0D0]/35">· {people.length}</span>
                </div>
                {group && (
                  <button
                    type="button"
                    onClick={() => removeGroup(group)}
                    disabled={groupsBusy}
                    title={`Remove ${group.name}`}
                    aria-label={`Remove ${group.name}`}
                    className="shrink-0 rounded px-1 text-[#E8E0D0]/35 transition hover:text-[#F5A3A3] disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {people.length === 0 ? (
                  <p className="px-1 py-3 text-center text-[11px] text-[#E8E0D0]/25">
                    {col.groupId === null ? 'Everyone is assigned' : 'Drop people here'}
                  </p>
                ) : (
                  people.map((p) => (
                    <Chip
                      key={p.id}
                      person={p}
                      columns={columns}
                      currentGroupId={col.groupId}
                      dragging={draggingId === p.id}
                      menuOpen={openMenuId === p.id}
                      removing={removingId === p.id}
                      error={chipErrors[p.id]}
                      onDragStart={() => setDraggingId(p.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverCol(null);
                      }}
                      onToggleMenu={() => setOpenMenuId((cur) => (cur === p.id ? null : p.id))}
                      onCloseMenu={() => setOpenMenuId(null)}
                      onMove={(gid) => assignPerson(p.id, gid)}
                      onRemove={() => removeAttendee(p.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabular fallback — same data, no separate fetch. */}
      <details
        className="mt-6"
        open={listOpen}
        onToggle={(e) => setListOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]">
          List view
        </summary>
        {signups.length === 0 ? (
          <p className="mt-3 text-sm text-[#E8E0D0]/50">No sign-ups yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8E0D0]/15 text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Group</th>
                  <th className="py-2 pr-4 font-medium">Signed up</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E0D0]/10">
                {[...signups].sort(byName).map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4 text-[#E8E0D0]/70">
                      <a href={`mailto:${s.email}`} className="hover:text-[#E8E0D0]">
                        {s.email}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-[#E8E0D0]/70">{groupName(s.groupId)}</td>
                    <td className="py-2 pr-4 text-[#E8E0D0]/60">{formatDateTime(s.added_at)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeAttendee(s.id)}
                        className="text-[#E8E0D0]/50 transition hover:text-[#F5A3A3]"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </>
  );
}

function Chip({
  person,
  columns,
  currentGroupId,
  dragging,
  menuOpen,
  removing,
  error,
  onDragStart,
  onDragEnd,
  onToggleMenu,
  onCloseMenu,
  onMove,
  onRemove,
}: {
  person: EventSignup;
  columns: ColKey[];
  currentGroupId: number | null;
  dragging: boolean;
  menuOpen: boolean;
  removing: boolean;
  error?: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onMove: (groupId: number | null) => void;
  onRemove: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // When the menu opens, focus its first item; Escape and outside-clicks close
  // it. This is the keyboard/touch path — the board is fully operable here.
  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseMenu();
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        onCloseMenu();
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen, onCloseMenu]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    }
  }

  const destinations = columns.filter((c) => c.groupId !== currentGroupId);

  return (
    <div
      draggable
      data-person={person.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(person.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group relative rounded-md border px-2.5 py-1.5 text-sm transition ${
        error ? 'border-[#F5A3A3]/50 bg-[#F5A3A3]/[0.06]' : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.05]'
      } ${dragging ? 'opacity-40' : ''} ${removing ? 'opacity-50' : ''} cursor-grab active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-[#E8E0D0]">{person.name}</span>
            {person.songCount > 0 && (
              <span
                title={`${person.songCount} song${person.songCount === 1 ? '' : 's'} — moving them moves their songs`}
                className="shrink-0 rounded-full bg-[#c8a26a]/20 px-1.5 text-[10px] font-medium text-[#c8a26a]"
              >
                ♪ {person.songCount}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-[#E8E0D0]/45">{person.email}</div>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={onToggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Move or remove ${person.name}`}
          className="shrink-0 rounded px-1 leading-none text-[#E8E0D0]/40 transition hover:text-[#E8E0D0] focus:text-[#E8E0D0]"
        >
          ⋯
        </button>
      </div>

      {error && <div className="mt-1 text-[11px] text-[#F5A3A3]">{error}</div>}

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-1 top-full z-10 mt-1 w-48 rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] p-1 shadow-lg"
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">
            Move to
          </div>
          {destinations.map((c) => (
            <button
              key={c.groupId === null ? 'unassigned' : c.groupId}
              type="button"
              role="menuitem"
              onClick={() => onMove(c.groupId)}
              className="block w-full rounded px-2 py-1 text-left text-sm text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/10 focus:bg-[#E8E0D0]/10 focus:outline-none"
            >
              {c.label}
            </button>
          ))}
          <div className="my-1 border-t border-[#E8E0D0]/10" />
          <button
            type="button"
            role="menuitem"
            onClick={onRemove}
            className="block w-full rounded px-2 py-1 text-left text-sm text-[#F5A3A3]/90 transition hover:bg-[#F5A3A3]/10 focus:bg-[#F5A3A3]/10 focus:outline-none"
          >
            Remove from event
          </button>
        </div>
      )}
    </div>
  );
}
