'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import TrackCard from './TrackCard';

// A round's track list. Plays like a record: starting one track pauses the
// others, and when a track ends the next one starts. Admin gets reorder
// (up/down) and remove-from-round controls per track.
export default function PlaylistTracks({
  playlistId,
  initialTracks,
  commentsByTrack,
  viewerMemberId,
  isAdmin,
}: {
  playlistId: number;
  initialTracks: ClubTrack[];
  commentsByTrack: Record<number, ClubTrackComment[]>;
  viewerMemberId: number | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tracks, setTracks] = useState<ClubTrack[]>(initialTracks);
  const [error, setError] = useState<string | null>(null);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  function setAudioRef(trackId: number, el: HTMLAudioElement | null) {
    if (el) audioRefs.current.set(trackId, el);
    else audioRefs.current.delete(trackId);
  }

  function pauseOthers(trackId: number) {
    for (const [id, el] of audioRefs.current) {
      if (id !== trackId && !el.paused) el.pause();
    }
  }

  function playNext(trackId: number) {
    const index = tracks.findIndex((t) => t.id === trackId);
    const next = index >= 0 ? tracks[index + 1] : undefined;
    if (next) audioRefs.current.get(next.id)?.play().catch(() => {});
  }

  async function patch(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/club/playlists/${playlistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Couldn't update (${res.status})`);
      return false;
    }
    return true;
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    if (await patch({ reorder: next.map((t) => t.id) })) setTracks(next);
  }

  async function removeFromRound(trackId: number) {
    if (await patch({ removeTrackId: trackId })) {
      setTracks(tracks.filter((t) => t.id !== trackId));
    }
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-[#E8E0D0]/40">
        No tracks in this round yet — be the first to upload one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}
      {tracks.map((track, i) => (
        <div key={track.id}>
          {isAdmin && (
            <div className="mb-1 flex items-center justify-end gap-2 text-[10px] text-[#E8E0D0]/40">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="transition hover:text-[#E8E0D0] disabled:opacity-30"
              >
                ↑ up
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === tracks.length - 1}
                className="transition hover:text-[#E8E0D0] disabled:opacity-30"
              >
                ↓ down
              </button>
              <button
                type="button"
                onClick={() => removeFromRound(track.id)}
                className="transition hover:text-[#F5A3A3]"
              >
                remove from round
              </button>
            </div>
          )}
          <TrackCard
            track={track}
            initialComments={commentsByTrack[track.id] ?? []}
            viewerMemberId={viewerMemberId}
            isAdmin={isAdmin}
            onAudioRef={(el) => setAudioRef(track.id, el)}
            onPlay={() => pauseOthers(track.id)}
            onEnded={() => playNext(track.id)}
            onTrackDeleted={() => {
              setTracks((prev) => prev.filter((t) => t.id !== track.id));
              router.refresh();
            }}
          />
        </div>
      ))}
    </div>
  );
}
