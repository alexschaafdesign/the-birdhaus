'use client';

import { useRouter } from 'next/navigation';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import TrackCard from './TrackCard';

// TrackCard on its own page — deleting the track needs a navigation (back to
// the portal), which is why this thin client wrapper exists.
export default function SingleTrackView({
  track,
  initialComments,
  viewerMemberId,
  isAdmin,
}: {
  track: ClubTrack;
  initialComments: ClubTrackComment[];
  viewerMemberId: number | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <TrackCard
      track={track}
      initialComments={initialComments}
      viewerMemberId={viewerMemberId}
      isAdmin={isAdmin}
      onTrackDeleted={() => {
        router.push('/club');
        router.refresh();
      }}
    />
  );
}
