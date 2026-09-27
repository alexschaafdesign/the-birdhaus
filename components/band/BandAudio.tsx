'use client';

import { useGlobalPlayer } from '@/components/player/GlobalPlayer';
import type { PlayerTrack } from '@/lib/player-tracks';

// Compact play/pause toggles for the band list rows. These used to ride on a
// list-local shared <audio>; now they're thin controls over the site-wide
// player (GlobalPlayer), so a track started here keeps playing in the bottom
// bar across navigation, and starting anything else replaces it. `queue` is
// the visible list order, for auto-advance.

// A compact play/pause toggle for a list row. Stops click propagation so it
// never triggers the surrounding row Link or a drag.
export function BandPlayButton({
  track,
  queue,
  className = '',
}: {
  track: PlayerTrack;
  queue?: PlayerTrack[];
  className?: string;
}) {
  const player = useGlobalPlayer();
  const isCurrent = player.current?.key === track.key;
  const isPlaying = isCurrent && player.playing;
  const isLoading = isCurrent && player.loading && !player.playing;
  return (
    <button
      type="button"
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isCurrent) player.toggle();
        else player.play(track, { queue });
      }}
      aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      title={isPlaying ? 'Pause' : 'Play'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
        isPlaying || isLoading
          ? 'border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]'
          : 'border-[#E8E0D0]/25 text-[#E8E0D0]/60 hover:border-[#c8a26a] hover:text-[#c8a26a]'
      } ${className}`}
    >
      {isLoading ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : isPlaying ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor" aria-hidden>
          <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
        </svg>
      )}
    </button>
  );
}
