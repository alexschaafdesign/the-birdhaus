'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BandSong } from '@/lib/band-songs';
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
}: {
  songs: BandSong[];
  allTags: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BandSongStatus | 'all'>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('active');
  const [tagsOpen, setTagsOpen] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    let out = songs.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (tags.length > 0 && !tags.every((t) => s.tags.includes(t))) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.tags.some((t) => t.includes(q)))
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
  }, [songs, search, status, tags, sort]);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
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
        body: JSON.stringify({ title }),
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

  const hasFilter = search.trim() !== '' || status !== 'all' || tags.length > 0;

  return (
    <div>
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
            placeholder="Search titles and tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputBase}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className={`${inputBase} w-auto shrink-0`}
          >
            <option value="active">Recently active</option>
            <option value="newest">Newest</option>
            <option value="title">Title A–Z</option>
            <option value="status">Pipeline order</option>
          </select>
        </div>

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
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setTags([]);
                }}
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
              href={`/yellow-ostrich/songs/${song.id}`}
              className="block rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
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
                <span className="shrink-0 text-xs text-[#E8E0D0]/40">
                  {song.versionCount > 0 &&
                    `${song.versionCount} ${song.versionCount === 1 ? 'version' : 'versions'}`}
                  {song.versionCount > 0 && song.commentCount > 0 && ' · '}
                  {song.commentCount > 0 &&
                    `${song.commentCount} ${song.commentCount === 1 ? 'comment' : 'comments'}`}
                  {(song.versionCount > 0 || song.commentCount > 0) && ' · '}
                  {fmtDate(song.updatedAt)}
                </span>
              </div>
              {song.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
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
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
