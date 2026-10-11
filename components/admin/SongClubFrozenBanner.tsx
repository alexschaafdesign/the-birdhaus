'use client';

import { usePathname } from 'next/navigation';
import { SONG_CLUB_FROZEN_MESSAGE, songhausAdminUrlFor } from '@/lib/song-club-freeze';

// Top-of-page notice on the frozen Song Club admin, linking to the same page
// in Songhaus admin.
export default function SongClubFrozenBanner({ href }: { href?: string }) {
  const pathname = usePathname();
  return (
    <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-4 text-sm text-amber-100">
      <p className="font-medium">{SONG_CLUB_FROZEN_MESSAGE}</p>
      <p className="mt-1 text-amber-100/80">
        Make changes in{' '}
        <a href={href ?? songhausAdminUrlFor(pathname)} className="underline underline-offset-2 hover:text-white">
          Songhaus admin
        </a>
        . Saving and sending are turned off here.
      </p>
    </div>
  );
}
