'use client';

import { useMemo } from 'react';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import TrackCard from './TrackCard';
import { clubTrackToPlayerTrack, type PlayerTrack } from '@/lib/player-tracks';

// The event page's cross-group feed: the round's newest songs, all groups
// mixed, as dense cards tagged "Day N · Group". The feed order is the play
// queue handed to the global player, so it plays through like a record (and
// keeps going in the bottom bar after navigating away). Like/comment work in
// place — comments are track-scoped, so the thread here IS the group page's
// thread.
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
  const playQueue = useMemo<PlayerTrack[]>(
    () => tracks.filter((t) => t.url).map(clubTrackToPlayerTrack),
    [tracks]
  );

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
          queue={playQueue}
        />
      ))}
    </div>
  );
}
