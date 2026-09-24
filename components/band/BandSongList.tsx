'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BandSong } from '@/lib/band-songs';
import type { BandSongGroup } from '@/lib/band-groups';
import BandGroupsView from '@/components/band/BandGroupsView';
import { BandAudioProvider, BandPlayButton } from '@/components/band/BandAudio';
import {
  BAND_SONG_STATUSES,
  BAND_SONG_STATUS_LABEL,
  type BandSongStatus,
} from '@/lib/band-constants';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

const chipBase = 'rounded-full border px-3 py-1 text-xs transition';
const chipOff = `${chipBase} border-[#E8E0D0]/20 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/40`;
const chipOn = `${chipBase} border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]`;
// Excluded group ("not in X").
const chipExc = `${chipBase} border-[#F5A3A3]/55 bg-[#F5A3A3]/10 text-[#F5A3A3]`;

const STATUS_PILL: Record<BandSongStatus, string> = {
  idea: 'border-[#E8E0D0]/25 text-[#E8E0D0]/55',
  demo: 'border-[#E8E0D0]/25 text-[#E8E0D0]/75',
  in_progress: 'border-[#E8E0D0]/40 text-[#E8E0D0]',
  contender: 'border-[#c8a26a] text-[#c8a26a]',
  cut: 'border-[#F5A3A3]/50 text-[#F5A3A3]/80',
};

type SortKey = 'active' | 'newest' | 'title' | 'status';

// The whole pile ships to the client (this is a private tool with ~50-100
// rows) so filtering and sorting are instant, no round trips.
export default function BandSongList({
  songs,
  allTags,
  groups,
  workspace,
}: {
  songs: BandSong[];
  allTags: string[];
  groups: BandSongGroup[];
  workspace: { id: number; slug: string };
}) {
  const router = useRouter();
  const [view, setView] = useState<'all' | 'groups'>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BandSongStatus | 'all'>('all');
  const [tags, setTags] = useState<string[]>([]);
  // Per-group tri-state filter: 'in' keeps songs in the group, 'out' keeps
  // songs NOT in it. Absent = the group doesn't constrain the list. Includes
  // AND together, excludes AND-NOT — so "in Louder, not in meh" is expressible.
  const [groupState, setGroupState] = useState<Record<number, 'in' | 'out'>>({});
  const [ungroupedOnly, setUngroupedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('active');
  const [tagsOpen, setTagsOpen] = useState(false);

  // Which row's group popover is open, if any.
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [newGroupDraft, setNewGroupDraft] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group names per song, for the row badges.
  const songGroupNames = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const g of groups) {
      for (const id of g.songIds) map.set(id, [...(map.get(id) ?? []), g.name]);
    }
    return map;
  }, [groups]);

  // Which group ids each song belongs to, for the tri-state group filter.
  const groupIdsBySong = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const g of groups) {
      for (const id of g.songIds) {
        const set = map.get(id) ?? new Set<number>();
        set.add(g.id);
        map.set(id, set);
      }
    }
    return map;
  }, [groups]);

  const ungroupedCount = useMemo(
    () => songs.filter((s) => !groupIdsBySong.get(s.id)?.size).length,
    [songs, groupIdsBySong]
  );

  // Tap a group chip to cycle: any → in → not in → any. Picking a group and
  // the "Ungrouped" toggle are mutually exclusive.
  function cycleGroup(id: number) {
    setUngroupedOnly(false);
    setGroupState((prev) => {
      const next = { ...prev };
      if (!prev[id]) next[id] = 'in';
      else if (prev[id] === 'in') next[id] = 'out';
      else delete next[id];
      return next;
    });
  }

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(BAND_SONG_STATUSES.map((s) => [s, 0])) as Record<
      BandSongStatus,
      number
    >;
    for (const s of songs) counts[s.status]++;
    return counts;
  }, [songs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inc: number[] = [];
    const exc: number[] = [];
    for (const [id, mode] of Object.entries(groupState)) {
      (mode === 'in' ? inc : exc).push(Number(id));
    }
    let out = songs.filter((s) => {
      const gs = groupIdsBySong.get(s.id);
      if (ungroupedOnly) {
        if (gs && gs.size > 0) return false;
      } else {
        if (inc.some((id) => !gs?.has(id))) return false;
        if (exc.some((id) => gs?.has(id))) return false;
      }
      if (status !== 'all' && s.status !== status) return false;
      if (tags.length > 0 && !tags.every((t) => s.tags.includes(t))) return false;
      if (
        q &&
        !s.title.toLowerCase().includes(q) &&
        !s.tags.some((t) => t.includes(q)) &&
        !s.lyrics?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    if (sort === 'newest') {
      out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === 'title') {
      out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'status') {
      out = [...out].sort(
        (a, b) =>
          BAND_SONG_STATUSES.indexOf(a.status) - BAND_SONG_STATUSES.indexOf(b.status) ||
          a.title.localeCompare(b.title)
      );
    }
    // 'active' keeps the server order: pinned first, then recently touched.
    return out;
  }, [songs, search, status, tags, sort, groupState, ungroupedOnly, groupIdsBySong]);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  // Group membership toggles from the row popover round-trip and refresh,
  // same as every other mutation in the tool.
  async function toggleMembership(groupId: number, songId: number, inGroup: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = inGroup
        ? await fetch(`/api/ostrich/groups/${groupId}/members/${songId}`, { method: 'DELETE' })
        : await fetch(`/api/ostrich/groups/${groupId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't update group (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  // "New group…" inside the popover: create it and drop the song straight in.
  async function createGroupWithSong(songId: number) {
    const name = newGroupDraft.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ostrich/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't create group (${res.status})`);
      await fetch(`/api/ostrich/groups/${data.group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      setNewGroupDraft('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function addSong(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ostrich/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, workspaceId: workspace.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't add (${res.status})`);
      setNewTitle('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  const hasFilter =
    search.trim() !== '' ||
    status !== 'all' ||
    tags.length > 0 ||
    Object.keys(groupState).length > 0 ||
    ungroupedOnly;

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setTags([]);
    setGroupState({});
    setUngroupedOnly(false);
  }

  return (
    <BandAudioProvider>
    <div>
      {/* Master list vs. sectioned Groups browse. */}
      <div className="mb-5 flex gap-1.5">
        <button
          type="button"
          onClick={() => setView('all')}
          className={view === 'all' ? chipOn : chipOff}
        >
          All songs
        </button>
        <button
          type="button"
          onClick={() => setView('groups')}
          className={view === 'groups' ? chipOn : chipOff}
        >
          Groups{groups.length > 0 && ` ${groups.length}`}
        </button>
      </div>

      {view === 'groups' ? (
        <BandGroupsView songs={songs} groups={groups} workspace={workspace} />
      ) : (
        <>
      {/* Click-away for the row group popover. */}
      {menuFor !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => {
            e.preventDefault();
            setMenuFor(null);
            setNewGroupDraft('');
          }}
        />
      )}

      {/* Quick add — titles first, details on the song page. */}
      <form onSubmit={addSong} className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Add a song…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className={inputBase}
        />
        <button
          type="submit"
          disabled={busy || !newTitle.trim()}
          className="shrink-0 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
        <Link
          href={`/w/${workspace.slug}/import`}
          className="shrink-0 rounded-md border border-[#E8E0D0]/25 px-4 py-2 text-sm font-medium text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
        >
          Import files
        </Link>
      </form>
      {error && (
        <div className="mb-4 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search titles, tags, and lyrics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputBase} min-w-0`}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className="shrink-0 rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] transition focus:border-[#E8E0D0]/50 focus:outline-none"
          >
            <option value="active">Recently active</option>
            <option value="newest">Newest</option>
            <option value="title">Title A–Z</option>
            <option value="status">Pipeline order</option>
          </select>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setUngroupedOnly((v) => !v);
                setGroupState({});
              }}
              className={ungroupedOnly ? chipOn : chipOff}
            >
              Ungrouped {ungroupedCount}
            </button>
            {groups.map((g) => {
              const mode = groupState[g.id];
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => cycleGroup(g.id)}
                  title="Tap to cycle: in → not in → any"
                  className={mode === 'in' ? chipOn : mode === 'out' ? chipExc : chipOff}
                >
                  {mode === 'out' && 'not '}
                  {g.name} {g.songIds.length}
                </button>
              );
            })}
            {(Object.keys(groupState).length > 0 || ungroupedOnly) && (
              <button
                type="button"
                onClick={() => {
                  setGroupState({});
                  setUngroupedOnly(false);
                }}
                className="text-xs text-[#E8E0D0]/45 underline-offset-2 hover:text-[#E8E0D0] hover:underline"
              >
                reset groups
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatus('all')}
            className={status === 'all' ? chipOn : chipOff}
          >
            All {songs.length}
          </button>
          {BAND_SONG_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(status === s ? 'all' : s)}
              className={status === s ? chipOn : chipOff}
            >
              {BAND_SONG_STATUS_LABEL[s]} {statusCounts[s]}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(tagsOpen || allTags.length <= 12 ? allTags : allTags.slice(0, 12)).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={tags.includes(tag) ? chipOn : chipOff}
              >
                {tag}
              </button>
            ))}
            {allTags.length > 12 && (
              <button
                type="button"
                onClick={() => setTagsOpen(!tagsOpen)}
                className="text-xs text-[#E8E0D0]/45 underline-offset-2 hover:text-[#E8E0D0] hover:underline"
              >
                {tagsOpen ? 'fewer tags' : `+${allTags.length - 12} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#E8E0D0]/40">
          {hasFilter ? (
            <>
              Nothing matches —{' '}
              <button
                type="button"
                onClick={clearFilters}
                className="underline underline-offset-2 hover:text-[#E8E0D0]"
              >
                clear filters
              </button>
              .
            </>
          ) : (
            'No songs yet — add the first one above.'
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((song) => (
            <Link
              key={song.id}
              href={`/w/${workspace.slug}/songs/${song.id}`}
              className="relative block rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {song.latestVersionId && song.latestVersionUrl && (
                    <BandPlayButton
                      versionId={song.latestVersionId}
                      url={song.latestVersionUrl}
                      title={song.title}
                    />
                  )}
                  {song.pinned && (
                    <span title="Pinned" className="shrink-0 text-[#c8a26a]">
                      ★
                    </span>
                  )}
                  <span className="truncate text-sm font-semibold">{song.title}</span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_PILL[song.status]}`}
                  >
                    {BAND_SONG_STATUS_LABEL[song.status]}
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-xs text-[#E8E0D0]/40">
                  <span>
                    {song.lyrics && 'lyrics · '}
                    {song.versionCount > 0 &&
                      `${song.versionCount} ${song.versionCount === 1 ? 'version' : 'versions'}`}
                    {song.versionCount > 0 && song.commentCount > 0 && ' · '}
                    {song.commentCount > 0 &&
                      `${song.commentCount} ${song.commentCount === 1 ? 'comment' : 'comments'}`}
                    {(song.versionCount > 0 || song.commentCount > 0) && ' · '}
                    {fmtDate(song.updatedAt)}
                  </span>
                  {/* Group membership popover — inside the row Link, so every
                      click must stop the navigation. */}
                  <button
                    type="button"
                    title="Groups"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuFor(menuFor === song.id ? null : song.id);
                      setNewGroupDraft('');
                    }}
                    className="rounded-full border border-[#E8E0D0]/20 px-1.5 py-0.5 text-[11px] leading-none text-[#E8E0D0]/50 transition hover:border-[#c8a26a] hover:text-[#c8a26a]"
                  >
                    +
                  </button>
                </span>
              </div>
              {menuFor === song.id && (
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="absolute right-3 top-11 z-20 w-60 rounded-lg border border-[#E8E0D0]/20 bg-[#221d19] p-2 shadow-xl"
                >
                  <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">
                    Groups
                  </p>
                  {groups.map((g) => {
                    const inGroup = g.songIds.includes(song.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleMembership(g.id, song.id, inGroup);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-[#E8E0D0]/80 transition hover:bg-[#E8E0D0]/[0.07] disabled:opacity-50"
                      >
                        <span className="truncate">{g.name}</span>
                        <span className={inGroup ? 'text-[#c8a26a]' : 'text-[#E8E0D0]/25'}>
                          {inGroup ? '✓' : '+'}
                        </span>
                      </button>
                    );
                  })}
                  <form
                    className="mt-1 flex gap-1 border-t border-[#E8E0D0]/10 pt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      createGroupWithSong(song.id);
                    }}
                  >
                    <input
                      type="text"
                      value={newGroupDraft}
                      placeholder="New group…"
                      onChange={(e) => setNewGroupDraft(e.target.value)}
                      className="w-full rounded border border-[#E8E0D0]/20 bg-transparent px-2 py-1 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy || !newGroupDraft.trim()}
                      className="shrink-0 rounded bg-[#E8E0D0]/15 px-2 text-xs text-[#E8E0D0] disabled:opacity-50"
                    >
                      Add
                    </button>
                  </form>
                </div>
              )}
              {(song.tags.length > 0 || (songGroupNames.get(song.id)?.length ?? 0) > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(songGroupNames.get(song.id) ?? []).map((name) => (
                    <span
                      key={`g-${name}`}
                      className="rounded-full border border-[#c8a26a]/35 bg-[#c8a26a]/10 px-2 py-0.5 text-[10px] text-[#c8a26a]/90"
                    >
                      {name}
                    </span>
                  ))}
                  {song.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#E8E0D0]/[0.07] px-2 py-0.5 text-[10px] text-[#E8E0D0]/55"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
        </>
      )}
    </div>
    </BandAudioProvider>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
