'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BandSong } from '@/lib/band-songs';
import type { BandSongGroup } from '@/lib/band-groups';
import { BAND_SONG_STATUS_LABEL, type BandSongStatus } from '@/lib/band-constants';

const inputBase =
  'rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

const STATUS_PILL: Record<BandSongStatus, string> = {
  idea: 'border-[#E8E0D0]/25 text-[#E8E0D0]/55',
  demo: 'border-[#E8E0D0]/25 text-[#E8E0D0]/75',
  in_progress: 'border-[#E8E0D0]/40 text-[#E8E0D0]',
  contender: 'border-[#c8a26a] text-[#c8a26a]',
  cut: 'border-[#F5A3A3]/50 text-[#F5A3A3]/80',
};

// The sectioned Groups view: one section per group, songs in group order.
// Reordering is native HTML5 drag within a section — the list reorders live
// under the drag as a preview, and the full id order is PUT on drop. All
// other mutations round-trip and router.refresh() like the rest of the tool.
export default function BandGroupsView({
  songs,
  groups,
}: {
  songs: BandSong[];
  groups: BandSongGroup[];
}) {
  const router = useRouter();
  const songById = new Map(songs.map((s) => [s.id, s]));

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Local order overrides while a drag is in flight; server order (props)
  // wins again after every refresh.
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [drag, setDrag] = useState<{ groupId: number; songId: number } | null>(null);
  useEffect(() => setOrders({}), [groups]);

  function orderFor(g: BandSongGroup): number[] {
    return orders[g.id] ?? g.songIds;
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

  function moveUnder(g: BandSongGroup, dragId: number, overId: number) {
    const order = orderFor(g).filter((id) => id !== dragId);
    const at = order.indexOf(overId);
    order.splice(at === -1 ? order.length : at, 0, dragId);
    setOrders((prev) => ({ ...prev, [g.id]: order }));
  }

  async function commitOrder(g: BandSongGroup) {
    const order = orders[g.id];
    setDrag(null);
    if (!order) return;
    await api(`/api/ostrich/groups/${g.id}/members`, {
      method: 'PUT',
      body: JSON.stringify({ songIds: order }),
    });
  }

  return (
    <div className="space-y-6">
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

      {error && (
        <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}

      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-[#E8E0D0]/40">
          No groups yet — create one above, then add songs from the master list
          (the + on each row) or with the picker inside a group.
        </p>
      )}

      {groups.map((g) => {
        const order = orderFor(g);
        const members = order
          .map((id) => songById.get(id))
          .filter((s): s is BandSong => Boolean(s));
        const outside = songs.filter((s) => !g.songIds.includes(s.id));
        return (
          <section
            key={g.id}
            className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]"
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
              className="divide-y divide-[#E8E0D0]/[0.06]"
              onDragOver={(e) => {
                if (drag?.groupId === g.id) e.preventDefault();
              }}
              onDrop={(e) => {
                if (drag?.groupId !== g.id) return;
                e.preventDefault();
                commitOrder(g);
              }}
            >
              {members.length === 0 && (
                <p className="px-4 py-4 text-sm text-[#E8E0D0]/40">
                  Empty — add songs below, or from the master list.
                </p>
              )}
              {members.map((song, i) => (
                <div
                  key={song.id}
                  draggable
                  onDragStart={() => setDrag({ groupId: g.id, songId: song.id })}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => {
                    if (drag?.groupId !== g.id || drag.songId === song.id) return;
                    e.preventDefault();
                    moveUnder(g, drag.songId, song.id);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    drag?.songId === song.id && drag.groupId === g.id
                      ? 'opacity-40'
                      : ''
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
                      api(`/api/ostrich/groups/${g.id}/members/${song.id}`, { method: 'DELETE' })
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
  );
}
