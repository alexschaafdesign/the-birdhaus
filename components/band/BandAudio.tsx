'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Lightweight one-at-a-time audio for the list views. The full waveform player
// (components/club/WaveformPlayer) is too heavy for dense rows, so inline play
// on the "All songs" and "Groups" lists rides on a single shared <audio>
// element: starting one track swaps the source and pauses whatever was going.
// Playback streams from the same gated /api/ostrich/audio/<versionId> URL the
// song page uses (302 → presigned GET), which a media element follows fine.
interface BandAudioState {
  // The version id currently playing, or mid-buffer loading, if any.
  playingId: number | null;
  loadingId: number | null;
  toggle: (versionId: number, url: string) => void;
}

const BandAudioContext = createContext<BandAudioState | null>(null);

export function useBandAudio(): BandAudioState | null {
  return useContext(BandAudioContext);
}

export function BandAudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Which version's source is loaded into the element (survives pause/resume).
  const loadedIdRef = useRef<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'none';
    // State is driven off the element's events so a stall, an error, or the
    // track ending all settle the UI without extra bookkeeping.
    audio.addEventListener('play', () => setLoadingId(loadedIdRef.current));
    audio.addEventListener('waiting', () => setLoadingId(loadedIdRef.current));
    audio.addEventListener('playing', () => {
      setLoadingId(null);
      setPlayingId(loadedIdRef.current);
    });
    audio.addEventListener('pause', () => setPlayingId(null));
    audio.addEventListener('ended', () => {
      setPlayingId(null);
      setLoadingId(null);
    });
    audio.addEventListener('error', () => {
      setPlayingId(null);
      setLoadingId(null);
    });
    audioRef.current = audio;
    return audio;
  }, []);

  const toggle = useCallback(
    (versionId: number, url: string) => {
      const audio = ensureAudio();
      if (loadedIdRef.current === versionId) {
        // Same track loaded: pause if playing, resume otherwise.
        if (!audio.paused && !audio.ended) {
          audio.pause();
          return;
        }
        setLoadingId(versionId);
        audio.play().catch(() => setLoadingId(null));
        return;
      }
      // New track — swap the source and start. Assigning src + play() aborts
      // any current playback (the pause listener clears its state).
      loadedIdRef.current = versionId;
      audio.src = url;
      setLoadingId(versionId);
      audio.play().catch(() => setLoadingId(null));
    },
    [ensureAudio]
  );

  return (
    <BandAudioContext.Provider value={{ playingId, loadingId, toggle }}>
      {children}
    </BandAudioContext.Provider>
  );
}

// A compact play/pause toggle for a list row. Renders nothing outside a
// provider or without a playable url. Stops click propagation so it never
// triggers the surrounding row Link or a drag.
export function BandPlayButton({
  versionId,
  url,
  title,
  className = '',
}: {
  versionId: number;
  url: string;
  title: string;
  className?: string;
}) {
  const audio = useBandAudio();
  if (!audio) return null;
  const isPlaying = audio.playingId === versionId;
  const isLoading = audio.loadingId === versionId;
  return (
    <button
      type="button"
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        audio.toggle(versionId, url);
      }}
      aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
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
