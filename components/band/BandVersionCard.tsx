'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BandSongComment, BandSongVersion } from '@/lib/band-songs';
import WaveformPlayer from '@/components/club/WaveformPlayer';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

// One recording of the song. Timestamped comments pinned to this version show
// as avatar markers on the waveform (same as Song Club tracks). If the song
// has lyrics, the card also carries its "lyrics as recorded" snapshot — the
// revision that was current at upload, re-pinnable to any other revision.
export default function BandVersionCard({
  version,
  markers,
  canEdit,
  lyricsRevisions = [],
}: {
  version: BandSongVersion;
  markers: BandSongComment[];
  canEdit: boolean;
  // Newest first, same list the Lyrics section shows.
  lyricsRevisions?: Array<{ id: number; createdAt: string; body: string }>;
}) {
  const pinned = lyricsRevisions.find((r) => r.id === version.lyricsRevisionId) ?? null;
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [repinning, setRepinning] = useState(false);
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(version.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/versions/${version.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't rename (${res.status})`);
      }
      setRenaming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function pinRevision(revisionId: number | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/versions/${version.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyricsRevisionId: revisionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't update (${res.status})`);
      }
      setRepinning(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`Delete “${version.label}”? Comments on it stay with the song.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/versions/${version.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      }
      router.refresh();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        {renaming ? (
          <form onSubmit={saveLabel} className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              className={inputBase}
            />
            <button
              type="submit"
              disabled={busy || !label.trim()}
              className="shrink-0 rounded-md bg-[#E8E0D0] px-3 py-1.5 text-xs font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setLabel(version.label);
              }}
              className="shrink-0 text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="min-w-0">
              <span className="text-sm font-semibold">{version.label}</span>
              <span className="ml-2 text-xs text-[#E8E0D0]/40">
                {version.uploaderName} · {fmtDate(version.createdAt)}
                {version.sizeBytes !== null && ` · ${fmtSize(version.sizeBytes)}`}
              </span>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="text-[#F5A3A3]/70 underline-offset-2 transition hover:text-[#F5A3A3] hover:underline"
                >
                  Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {version.peaks ? (
        <WaveformPlayer
          url={version.url}
          peaks={version.peaks}
          durationSeconds={version.durationSeconds}
          markers={markers.map((c) => ({
            id: c.id,
            timestampSeconds: c.timestampSeconds ?? 0,
            authorName: c.authorName,
            avatarUrl: c.avatarUrl,
            body: c.body,
          }))}
        />
      ) : (
        // No peaks (the browser couldn't decode this codec at upload time) —
        // fall back to the native player.
        <audio controls preload="none" src={version.url} className="w-full" />
      )}

      {lyricsRevisions.length > 0 && (
        <div className="mt-2 text-xs">
          {pinned ? (
            <button
              type="button"
              onClick={() => {
                setLyricsOpen(!lyricsOpen);
                setRepinning(false);
              }}
              className={`underline-offset-2 transition hover:underline ${
                lyricsOpen ? 'text-[#c8a26a]' : 'text-[#E8E0D0]/45 hover:text-[#E8E0D0]'
              }`}
            >
              ♪ lyrics as recorded {lyricsOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="text-[#E8E0D0]/35">
              no lyrics snapshot —{' '}
              <button
                type="button"
                onClick={() => setRepinning(!repinning)}
                className="underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
              >
                pin one
              </button>
            </span>
          )}

          {lyricsOpen && pinned && (
            <div className="mt-2 rounded-md border border-[#E8E0D0]/10 bg-[#E8E0D0]/[0.02] p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#E8E0D0]/80">
                {pinned.body}
              </p>
              <div className="mt-2 flex items-center gap-3 border-t border-[#E8E0D0]/10 pt-2 text-[11px] text-[#E8E0D0]/40">
                <span>revision from {fmtWhen(pinned.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => setRepinning(!repinning)}
                  className="underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
                >
                  change
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pinRevision(null)}
                  className="underline-offset-2 transition hover:text-[#F5A3A3] hover:underline disabled:opacity-50"
                >
                  unpin
                </button>
              </div>
            </div>
          )}

          {repinning && (
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) pinRevision(id);
              }}
              aria-label="Pin a lyrics revision to this version"
              className="mt-2 w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0]/70 focus:border-[#E8E0D0]/50 focus:outline-none"
            >
              <option value="">Pick the lyrics this recording used…</option>
              {lyricsRevisions.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {fmtWhen(r.createdAt)}
                  {i === 0 ? ' (current)' : ''}
                  {r.id === version.lyricsRevisionId ? ' (pinned)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}
    </div>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
