'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BandSongComment } from '@/lib/band-songs';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

// The song's running thread. A comment can be about the song in general or
// pinned to one version ("on: demo v2"); adding a timestamp UI can come later
// (the column already exists).
export default function BandSongComments({
  songId,
  comments,
  versions,
  viewerMemberId,
  canModerate,
}: {
  songId: number;
  comments: BandSongComment[];
  versions: Array<{ id: number; label: string }>;
  viewerMemberId: number | null;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [versionId, setVersionId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/songs/${songId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          versionId: versionId ? Number(versionId) : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't post (${res.status})`);
      setBody('');
      setVersionId('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this comment?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/comments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div>
      {comments.length === 0 ? (
        <p className="mb-4 text-sm text-[#E8E0D0]/40">No comments yet.</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span className="mt-0.5 block h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#E8E0D0]/10">
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#E8E0D0]/70">
                    {c.authorName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold text-[#E8E0D0]/85">{c.authorName}</span>
                  {c.versionLabel && (
                    <span className="rounded-full bg-[#c8a26a]/15 px-2 py-0.5 text-[10px] text-[#c8a26a]">
                      on: {c.versionLabel}
                      {c.timestampSeconds !== null && ` @ ${fmtTime(c.timestampSeconds)}`}
                    </span>
                  )}
                  <span className="text-[#E8E0D0]/35">{fmtDate(c.createdAt)}</span>
                  {(canModerate || (viewerMemberId !== null && c.memberId === viewerMemberId)) && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="text-[#E8E0D0]/30 underline-offset-2 transition hover:text-[#F5A3A3] hover:underline"
                    >
                      delete
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-[#E8E0D0]/80">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <textarea
          rows={3}
          placeholder="Thoughts on this one…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputBase} resize-y`}
        />
        <div className="flex items-center gap-2">
          {versions.length > 0 && (
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              aria-label="About which version"
              className={`${inputBase} w-auto`}
            >
              <option value="">About the song</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  on: {v.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="ml-auto rounded-md bg-[#E8E0D0] px-5 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
