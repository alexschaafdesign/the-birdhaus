'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BandSong } from '@/lib/band-songs';
import type { BandSongGroup } from '@/lib/band-groups';
import {
  BAND_SONG_STATUSES,
  BAND_SONG_STATUS_LABEL,
  type BandSongStatus,
} from '@/lib/band-constants';

const inputBase =
  'rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

const chipBase = 'rounded-full border px-2.5 py-0.5 text-[11px] transition';
const chipOff = `${chipBase} border-[#E8E0D0]/20 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/40`;
const chipOn = `${chipBase} border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]`;

const STATUS_PILL: Record<BandSongStatus, string> = {
  idea: 'border-[#E8E0D0]/25 text-[#E8E0D0]/55',
  demo: 'border-[#E8E0D0]/25 text-[#E8E0D0]/75',
  in_progress: 'border-[#E8E0D0]/40 text-[#E8E0D0]',
  contender: 'border-[#c8a26a] text-[#c8a26a]',
  cut: 'border-[#F5A3A3]/50 text-[#F5A3A3]/80',
};

// A drag is either a master-list song being copied into a group, or a group
// member being reordered within its own group.
type Drag =
  | { from: 'master'; songId: number }
  | { from: 'group'; groupId: number; songId: number };

// The Groups organizer. On desktop it breaks out of the page column into two
// columns: the master list on the left (search + filters, rows draggable) and
// the group sections on the right as drop targets. Dropping a master row on a
// group COPIES it there — the master list is never mutated, and one song can
// be dropped into any number of groups. Within a group, dragging reorders.
// On small screens (no native drag) the master column hides and each group
// keeps its add-a-song picker.
export default function BandGroupsView({
  songs,
  groups,
}: {
  songs: BandSong[];
  groups: BandSongGroup[];
}) {
  const router = useRouter();
  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const groupCountBySong = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of groups)
      for (const id of g.songIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [groups]);

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Master-list column filters.
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BandSongStatus | 'all'>('all');
  const [ungroupedOnly, setUngroupedOnly] = useState(false);

  // Local order overrides while a drag is in flight (live preview under the
  // cursor); server order (props) wins again after every refresh.
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverGroup, setHoverGroup] = useState<number | null>(null);
  // Whether the current drag ended in a drop — a canceled drag (dropped
  // outside any group) must roll its preview back instead of lying.
  const droppedRef = useRef(false);
  useEffect(() => setOrders({}), [groups]);

  function orderFor(g: BandSongGroup): number[] {
    return orders[g.id] ?? g.songIds;
  }

  // Live preview: place dragId under overId (append when overId is null) in
  // group g. For master drags this also clears any preview the same drag
  // left in a group it hovered earlier.
  function previewOrder(g: BandSongGroup, d: Drag, overId: number | null) {
    setOrders((prev) => {
      const next: Record<number, number[]> = {};
      for (const grp of groups) {
        if (grp.id === g.id) continue;
        const ov = prev[grp.id];
        if (!ov) continue;
        if (d.from === 'master' && ov.includes(d.songId) && !grp.songIds.includes(d.songId))
          continue; // injected preview from an earlier hover — drop it
        next[grp.id] = ov;
      }
      const base = (prev[g.id] ?? g.songIds).filter((id) => id !== d.songId);
      const at = overId === null ? base.length : base.indexOf(overId);
      base.splice(at === -1 ? base.length : at, 0, d.songId);
      next[g.id] = base;
      return next;
    });
  }

  function acceptsDrag(g: BandSongGroup, d: Drag | null): d is Drag {
    if (!d) return false;
    if (d.from === 'group') return d.groupId === g.id;
    return !g.songIds.includes(d.songId);
  }

  async function api(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await api('/api/ostrich/groups', { method: 'POST', body: JSON.stringify({ name }) })) {
      setNewName('');
    }
  }

  async function commitReorder(g: BandSongGroup) {
    const order = orders[g.id];
    setDrag(null);
    setHoverGroup(null);
    if (!order) return;
    await api(`/api/ostrich/groups/${g.id}/members`, {
      method: 'PUT',
      body: JSON.stringify({ songIds: order }),
    });
  }

  // A master drop is add-then-order: POST appends the membership, and when
  // the preview placed it anywhere but the end, PUT fixes the position.
  async function commitMasterDrop(g: BandSongGroup, songId: number) {
    const order = orders[g.id] ?? [...g.songIds, songId];
    setDrag(null);
    setHoverGroup(null);
    const added = await api(`/api/ostrich/groups/${g.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ songId }),
    });
    if (!added) return;
    const finalOrder = order.includes(songId) ? order : [...order, songId];
    if (finalOrder[finalOrder.length - 1] !== songId) {
      await api(`/api/ostrich/groups/${g.id}/members`, {
        method: 'PUT',
        body: JSON.stringify({ songIds: finalOrder }),
      });
    }
  }

  function handleDrop(g: BandSongGroup, e: React.DragEvent) {
    if (!acceptsDrag(g, drag)) return;
    e.preventDefault();
    droppedRef.current = true;
    if (drag!.from === 'group') commitReorder(g);
    else commitMasterDrop(g, drag!.songId);
  }

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(BAND_SONG_STATUSES.map((s) => [s, 0])) as Record<
      BandSongStatus,
      number
    >;
    for (const s of songs) counts[s.status]++;
    return counts;
  }, [songs]);
  const ungroupedCount = songs.filter((s) => !groupCountBySong.has(s.id)).length;

  const masterList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return songs.filter((s) => {
      if (ungroupedOnly && groupCountBySong.has(s.id)) return false;
      if (status !== 'all' && s.status !== status) return false;
      if (
        q &&
        !s.title.toLowerCase().includes(q) &&
        !s.tags.some((t) => t.includes(q)) &&
        !s.lyrics?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [songs, search, status, ungroupedOnly, groupCountBySong]);

  return (
    // Break out of the page's narrow column on desktop so both columns fit.
    <div className="lg:relative lg:left-1/2 lg:w-[min(76rem,calc(100vw-3rem))] lg:-translate-x-1/2">
      {error && (
        <div className="mb-4 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-6">
        {/* Master list — drag rows into groups on the right. Hidden on small
            screens, where native drag doesn't exist; the per-group picker
            covers adding there. */}
        <div
          className="hidden lg:block"
          onDragOver={() => {
            // Dragging back out of the groups column withdraws the preview.
            if (hoverGroup !== null) setHoverGroup(null);
            if (drag?.from === 'master' && Object.keys(orders).length > 0) setOrders({});
          }}
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/45">
            Master list — drag into a group
          </p>
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputBase} mb-2 w-full`}
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStatus('all');
                setUngroupedOnly(false);
              }}
              className={status === 'all' && !ungroupedOnly ? chipOn : chipOff}
            >
              All {songs.length}
            </button>
            <button
              type="button"
              onClick={() => setUngroupedOnly(!ungroupedOnly)}
              className={ungroupedOnly ? chipOn : chipOff}
            >
              Ungrouped {ungroupedCount}
            </button>
            {BAND_SONG_STATUSES.map(
              (s) =>
                statusCounts[s] > 0 && (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(status === s ? 'all' : s)}
                    className={status === s ? chipOn : chipOff}
                  >
                    {BAND_SONG_STATUS_LABEL[s]} {statusCounts[s]}
                  </button>
                )
            )}
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {masterList.length === 0 && (
              <p className="py-6 text-center text-sm text-[#E8E0D0]/40">
                {ungroupedOnly ? 'Everything is in a group. 🎉' : 'Nothing matches.'}
              </p>
            )}
            {masterList.map((song) => {
              const inGroups = groupCountBySong.get(song.id) ?? 0;
              return (
                <div
                  key={song.id}
                  draggable
                  onDragStart={() => {
                    droppedRef.current = false;
                    setDrag({ from: 'master', songId: song.id });
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setHoverGroup(null);
                    if (!droppedRef.current) setOrders({});
                  }}
                  className={`flex cursor-grab items-center gap-2.5 rounded-md border border-[#E8E0D0]/10 bg-[#E8E0D0]/[0.03] px-3 py-2 transition active:cursor-grabbing hover:border-[#E8E0D0]/30 ${
                    drag?.from === 'master' && drag.songId === song.id ? 'opacity-40' : ''
                  }`}
                >
                  <span className="shrink-0 text-[#E8E0D0]/30">⋮⋮</span>
                  <Link
                    href={`/yellow-ostrich/songs/${song.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-[#E8E0D0] underline-offset-2 hover:underline"
                    draggable={false}
                  >
                    {song.title}
                  </Link>
                  {inGroups > 0 && (
                    <span
                      title={`In ${inGroups} group${inGroups === 1 ? '' : 's'}`}
                      className="shrink-0 rounded-full border border-[#c8a26a]/35 bg-[#c8a26a]/10 px-1.5 py-0.5 text-[10px] text-[#c8a26a]/90"
                    >
                      {inGroups}
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_PILL[song.status]}`}
                  >
                    {BAND_SONG_STATUS_LABEL[song.status]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Groups column. */}
        <div className="space-y-5">
          <form onSubmit={createGroup} className="flex gap-2">
            <input
              type="text"
              placeholder="New group — Current Favorites, Quiet Ones…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={`${inputBase} w-full`}
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="shrink-0 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </button>
          </form>

          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-[#E8E0D0]/40">
              No groups yet — create one above, then drag songs in from the master list.
            </p>
          )}

          {groups.map((g) => {
            const order = orderFor(g);
            const members = order
              .map((id) => songById.get(id))
              .filter((s): s is BandSong => Boolean(s));
            const outside = songs.filter((s) => !g.songIds.includes(s.id));
            const highlighted = hoverGroup === g.id && acceptsDrag(g, drag);
            return (
              <section
                key={g.id}
                onDragOver={(e) => {
                  if (!acceptsDrag(g, drag)) return;
                  e.preventDefault();
                  setHoverGroup(g.id);
                }}
                onDrop={(e) => handleDrop(g, e)}
                className={`rounded-lg border bg-[#E8E0D0]/[0.03] transition ${
                  highlighted ? 'border-[#c8a26a]/70' : 'border-[#E8E0D0]/15'
                }`}
              >
                <header className="flex items-center justify-between gap-3 border-b border-[#E8E0D0]/10 px-4 py-3">
                  {renaming === g.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          await api(`/api/ostrich/groups/${g.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ name: renameDraft }),
                          })
                        ) {
                          setRenaming(null);
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        autoFocus
                        className={`${inputBase} w-full py-1`}
                      />
                      <button type="submit" disabled={busy} className="text-xs text-[#c8a26a]">
                        save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(null)}
                        className="text-xs text-[#E8E0D0]/45"
                      >
                        cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(g.id);
                        setRenameDraft(g.name);
                        setConfirmDelete(null);
                      }}
                      title="Rename"
                      className="min-w-0 truncate text-left text-sm font-semibold text-[#E8E0D0] transition hover:text-[#c8a26a]"
                    >
                      {g.name}
                      <span className="ml-2 font-normal text-[#E8E0D0]/40">{members.length}</span>
                    </button>
                  )}
                  <div className="shrink-0 text-xs">
                    {confirmDelete === g.id ? (
                      <span className="text-[#F5A3A3]">
                        delete group?{' '}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => api(`/api/ostrich/groups/${g.id}`, { method: 'DELETE' })}
                          className="font-semibold underline underline-offset-2"
                        >
                          yes
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-[#E8E0D0]/45"
                        >
                          no
                        </button>
                      </span>
                    ) : (
                      renaming !== g.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(g.id)}
                          className="text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                        >
                          delete
                        </button>
                      )
                    )}
                  </div>
                </header>

                <div
                  className="min-h-[3rem] divide-y divide-[#E8E0D0]/[0.06]"
                  onDragOver={(e) => {
                    if (!acceptsDrag(g, drag)) return;
                    e.preventDefault();
                    // Hovering the section's empty space previews an append.
                    if (drag!.from === 'master' && order[order.length - 1] !== drag!.songId) {
                      previewOrder(g, drag!, null);
                    }
                  }}
                >
                  {members.length === 0 && (
                    <p className="px-4 py-4 text-sm text-[#E8E0D0]/40">
                      Empty — drag songs here from the master list, or use the picker below.
                    </p>
                  )}
                  {members.map((song, i) => (
                    <div
                      key={song.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        droppedRef.current = false;
                        setDrag({ from: 'group', groupId: g.id, songId: song.id });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setHoverGroup(null);
                        if (!droppedRef.current) setOrders({});
                      }}
                      onDragOver={(e) => {
                        if (!acceptsDrag(g, drag) || drag!.songId === song.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setHoverGroup(g.id);
                        previewOrder(g, drag!, song.id);
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 ${
                        drag?.songId === song.id ? 'opacity-40' : ''
                      }`}
                    >
                      <span
                        className="shrink-0 cursor-grab text-[#E8E0D0]/30 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        ⋮⋮
                      </span>
                      <span className="w-5 shrink-0 text-right text-xs text-[#E8E0D0]/35">
                        {i + 1}
                      </span>
                      <Link
                        href={`/yellow-ostrich/songs/${song.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-[#E8E0D0] underline-offset-2 hover:underline"
                        draggable={false}
                      >
                        {song.title}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_PILL[song.status]}`}
                      >
                        {BAND_SONG_STATUS_LABEL[song.status]}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          api(`/api/ostrich/groups/${g.id}/members/${song.id}`, {
                            method: 'DELETE',
                          })
                        }
                        title="Remove from group"
                        className="shrink-0 text-[#E8E0D0]/30 transition hover:text-[#F5A3A3]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {outside.length > 0 && (
                  <div className="border-t border-[#E8E0D0]/10 px-4 py-3">
                    <select
                      value=""
                      disabled={busy}
                      onChange={(e) => {
                        const songId = Number(e.target.value);
                        if (songId)
                          api(`/api/ostrich/groups/${g.id}/members`, {
                            method: 'POST',
                            body: JSON.stringify({ songId }),
                          });
                      }}
                      aria-label={`Add a song to ${g.name}`}
                      className={`${inputBase} w-full text-[#E8E0D0]/55`}
                    >
                      <option value="">+ Add a song…</option>
                      {outside.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
