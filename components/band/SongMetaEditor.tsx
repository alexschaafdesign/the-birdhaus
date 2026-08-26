'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BandSong } from '@/lib/band-songs';
import {
  BAND_SONG_STATUSES,
  BAND_SONG_STATUS_LABEL,
} from '@/lib/band-constants';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// The song's header + metadata, editable in place. Collaborative: anyone in
// the band can retitle, retag, or move it through the pipeline. Saves are
// explicit (one PATCH) so half-typed tags never hit the server.
export default function SongMetaEditor({
  song,
  allTags,
  canDelete,
}: {
  song: BandSong;
  allTags: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [status, setStatus] = useState(song.status);
  const [tags, setTags] = useState<string[]>(song.tags);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(song.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput('');
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/ostrich/songs/${song.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Couldn't save (${res.status})`);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Commit whatever's sitting in the tag input too — people forget Enter.
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase()].filter((t, i, a) => a.indexOf(t) === i)
        : tags;
      await patch({ title, status, tags: finalTags, notes: notes.trim() || null });
      setTags(finalTags);
      setTagInput('');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function togglePin() {
    setError(null);
    try {
      await patch({ pinned: !song.pinned });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${song.title}” and all its versions and comments?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/songs/${song.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      }
      router.push('/yellow-ostrich');
      router.refresh();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              {song.pinned && (
                <span title="Pinned" className="text-[#c8a26a]">
                  ★
                </span>
              )}
              <span className="min-w-0 break-words">{song.title}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-[#c8a26a]/60 px-2.5 py-0.5 text-xs uppercase tracking-wide text-[#c8a26a]">
                {BAND_SONG_STATUS_LABEL[song.status]}
              </span>
              {song.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#E8E0D0]/[0.07] px-2.5 py-0.5 text-xs text-[#E8E0D0]/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-1 text-xs">
            <button
              type="button"
              onClick={togglePin}
              className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              {song.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Edit
            </button>
          </div>
        </div>
        {song.notes && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-[#E8E0D0]/70">{song.notes}</p>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="space-y-4">
        <div>
          <label htmlFor="song-title" className={labelClass}>
            Title
          </label>
          <input
            type="text"
            id="song-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputBase}
          />
        </div>

        <div>
          <label htmlFor="song-status" className={labelClass}>
            Status
          </label>
          <select
            id="song-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as BandSong['status'])}
            className={inputBase}
          >
            {BAND_SONG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BAND_SONG_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="song-tags" className={labelClass}>
            Tags
          </label>
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-[#E8E0D0]/[0.07] px-2.5 py-0.5 text-xs text-[#E8E0D0]/70"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-[#E8E0D0]/40 transition hover:text-[#F5A3A3]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            id="song-tags"
            list="band-all-tags"
            placeholder="Add a tag, press Enter — vibes, categories, anything"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            className={inputBase}
          />
          <datalist id="band-all-tags">
            {allTags
              .filter((t) => !tags.includes(t))
              .map((t) => (
                <option key={t} value={t} />
              ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="song-notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="song-notes"
            rows={4}
            placeholder="Lyric ideas, what it needs, where it came from…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputBase} resize-y`}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || !title.trim()}
            className="rounded-md bg-[#E8E0D0] px-5 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTitle(song.title);
              setStatus(song.status);
              setTags(song.tags);
              setTagInput('');
              setNotes(song.notes ?? '');
              setError(null);
            }}
            className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
          >
            Cancel
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-auto text-xs text-[#F5A3A3]/70 underline-offset-2 transition hover:text-[#F5A3A3] hover:underline"
            >
              Delete song
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
