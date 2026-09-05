'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// After a member returns from login/signup with a "join" intent (?join=1),
// enroll them in the event automatically, then strip the param and refresh so
// the unlocked view renders. Only mounted for a logged-in member who isn't yet
// enrolled, so it fires exactly once.
export default function AutoJoin({ eventId, slug }: { eventId: number; slug: string }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      try {
        await fetch(`/api/club/events/${eventId}/participate`, { method: 'POST' });
      } catch {
        // best-effort; they can still click "Sign me up"
      }
      router.replace(`/song-club/${slug}`);
      router.refresh();
    })();
  }, [eventId, slug, router]);

  return (
    <p className="mt-6 text-sm text-[#E8E0D0]/50" aria-live="polite">
      Signing you up…
    </p>
  );
}
