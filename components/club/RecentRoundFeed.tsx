'use client';

import { useRef } from 'react';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import TrackCard from './TrackCard';
import type { TrackControls } from './WaveformPlayer';

// The event page's cross-group feed: the round's newest songs, all groups
// mixed, as dense cards tagged "Day N · Group". Same play-through behavior
// as a round: starting one track pauses the rest, and a finished track
// advances to the next in the feed. Like/comment work in place — comments
// are track-scoped, so the thread here IS the group page's thread.
export default function RecentRoundFeed({
  tracks,
  groupNames,
  commentsByTrack,
  viewerMemberId,
  isAdmin,
  eventStartDate,
}: {
  tracks: ClubTrack[];
  groupNames: Record<number, string | null>;
  commentsByTrack: Record<number, ClubTrackComment[]>;
  viewerMemberId: number | null;
  isAdmin: boolean;
  eventStartDate: string;
}) {
  const controlsRef = useRef<Map<number, TrackControls>>(new Map());

  function setControls(trackId: number, controls: TrackControls | null) {
    if (controls) controlsRef.current.set(trackId, controls);
    else controlsRef.current.delete(trackId);
  }

  function pauseOthers(trackId: number) {
    for (const [id, c] of controlsRef.current) {
      if (id !== trackId) c.pause();
    }
  }

  function playNext(trackId: number) {
    const index = tracks.findIndex((t) => t.id === trackId);
    const next = index >= 0 ? tracks[index + 1] : undefined;
    if (next) controlsRef.current.get(next.id)?.play();
  }

  function contextLabel(track: ClubTrack): string {
    const group = groupNames[track.id] ?? 'Unassigned';
    if (!track.day) return group;
    const n =
      Math.round(
        (Date.parse(track.day + 'T00:00:00Z') - Date.parse(eventStartDate + 'T00:00:00Z')) /
          86400000
      ) + 1;
    return n >= 1 ? `Day ${n} · ${group}` : group;
  }

  return (
    <div className="space-y-3">
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          initialComments={commentsByTrack[track.id] ?? []}
          viewerMemberId={viewerMemberId}
          isAdmin={isAdmin}
          dense
          contextLabel={contextLabel(track)}
          registerControls={(c) => setControls(track.id, c)}
          onPlay={() => pauseOthers(track.id)}
          onEnded={() => playNext(track.id)}
        />
      ))}
    </div>
  );
}
