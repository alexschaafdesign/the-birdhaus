'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGlobalPlayer } from './GlobalPlayer';

// The Samply/Spotify-style bar pinned to the bottom of every page while a
// track is loaded: what's playing (linking back to its page), prev/play/next,
// and a seekable progress strip. Renders nothing until something plays; the ✕
// stops playback and dismisses it. A same-height spacer sits in the page flow
// so the bar never covers the bottom of the content.
export default function PlayerBar() {
  const player = useGlobalPlayer();
  const pathname = usePathname();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const trackKey = player.current?.key ?? null;
  useEffect(() => {
    if (!trackKey) return;
    setTime(player.getCurrentTime());
    setDuration(player.getDuration());
    return player.subscribeTime((t, d) => {
      setTime(t);
      setDuration(d);
    });
    // subscribeTime/getCurrentTime are stable; re-run only on track change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  // The door kiosk and in-venue TV are chrome-less full-screen views.
  if (pathname.startsWith('/door') || pathname.startsWith('/tv')) return null;
  const track = player.current;
  if (!track) return null;

  const idx = player.queue.findIndex((t) => t.key === track.key);
  const hasNext = idx >= 0 && idx < player.queue.length - 1;
  const hasPrev = idx > 0;
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  function seekFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    player.seek(frac * duration);
  }

  return (
    <>
      <div aria-hidden className="h-20" />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8E0D0]/20 bg-[#1D1915]/95 backdrop-blur-sm">
        <div
          className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-2.5 sm:gap-4"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={player.prev}
              disabled={!hasPrev && time <= 3}
              aria-label="Previous track"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#E8E0D0]/60 transition hover:text-[#E8E0D0] disabled:opacity-30 disabled:hover:text-[#E8E0D0]/60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={player.toggle}
              aria-label={player.playing ? 'Pause' : 'Play'}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8E0D0] text-[#2A2420] transition hover:bg-white"
            >
              {player.loading && !player.playing ? (
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 animate-spin" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : player.playing ? (
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-0.5 h-4.5 w-4.5" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={player.next}
              disabled={!hasNext}
              aria-label="Next track"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#E8E0D0]/60 transition hover:text-[#E8E0D0] disabled:opacity-30 disabled:hover:text-[#E8E0D0]/60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
              </svg>
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 truncate text-sm">
                {track.href ? (
                  <Link
                    href={track.href}
                    className="font-medium text-[#E8E0D0] underline-offset-2 hover:underline"
                  >
                    {track.title}
                  </Link>
                ) : (
                  <span className="font-medium text-[#E8E0D0]">{track.title}</span>
                )}
                {track.subtitle && (
                  <span className="ml-2 text-xs text-[#E8E0D0]/50">{track.subtitle}</span>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#E8E0D0]/50">
                {fmt(time)} / {fmt(duration)}
              </span>
            </div>
            <div
              className="group mt-1.5 cursor-pointer py-1"
              onPointerDown={seekFromPointer}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(time)}
            >
              <div className="relative h-1 rounded-full bg-[#E8E0D0]/15 transition-[height] group-hover:h-1.5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#c8a26a]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={player.close}
            aria-label="Close player"
            title="Stop and close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {player.recovery === 'loading' && (
          <p className="mx-auto max-w-5xl px-4 pb-2 text-xs text-[#c8a26a]/80">
            Audio isn&apos;t loading the normal way — trying a fallback…
          </p>
        )}
        {player.recovery === 'undecodable' && (
          <p className="mx-auto max-w-5xl px-4 pb-2 text-xs text-[#F5A3A3]">
            This browser can&apos;t decode this recording — it may be in a format (like Apple
            Lossless) that only Safari plays.
          </p>
        )}
        {player.recovery === 'failed' && (
          <p className="mx-auto max-w-5xl px-4 pb-2 text-xs text-[#F5A3A3]">
            Audio isn&apos;t loading — usually the browser, not the track.{' '}
            <button
              type="button"
              onClick={player.retryRecovery}
              className="font-medium underline underline-offset-2 transition hover:text-white"
            >
              Try again
            </button>
          </p>
        )}
      </div>
    </>
  );
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
