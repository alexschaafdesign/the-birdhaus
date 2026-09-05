'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BandSongComment, BandSongVersion } from '@/lib/band-songs';
import WaveformPlayer from '@/components/club/WaveformPlayer';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

// One recording of the song. Timestamped comments pinned to this version show
// as avatar markers on the waveform (same as Song Club tracks).
export default function BandVersionCard({
  version,
  markers,
  canEdit,
}: {
  version: BandSongVersion;
  markers: BandSongComment[];
  canEdit: boolean;
}) {
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

      {error && (
        <div className="mt-2 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}
    </div>
  );
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
