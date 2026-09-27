'use client';

import { useEffect, useRef, useState } from 'react';
import { useGlobalPlayer } from '@/components/player/GlobalPlayer';
import type { PlayerTrack } from '@/lib/player-tracks';
import Waveform from '@/components/player/Waveform';

// Samply-style waveform for one track — but audio no longer lives here: this
// is a view + control surface for the site-wide player (GlobalPlayer), so
// playback keeps going in the bottom bar when the card scrolls away or the
// member navigates. Starting this track hands the global player the whole
// `queue` (the round/feed order) so auto-advance works like a record even
// after leaving the page. Clicking the waveform seeks when this track is
// playing, or starts it from that spot when it isn't.

// A timestamped comment to pin on the waveform.
export interface WaveformMarker {
  id: number;
  timestampSeconds: number;
  authorName: string;
  avatarUrl: string | null;
  body: string;
}

export default function WaveformPlayer({
  track,
  queue,
  markers = [],
  height = 72,
  onTimeSecond,
}: {
  track: PlayerTrack;
  // The list this track plays within (for auto-advance); defaults to just it.
  queue?: PlayerTrack[];
  markers?: WaveformMarker[];
  // Waveform height in px — 72 for full cards, smaller for dense feed rows.
  height?: number;
  onTimeSecond?: (sec: number) => void;
}) {
  const player = useGlobalPlayer();
  const active = player.current?.key === track.key;
  const playing = active && player.playing;
  const recovery = active ? player.recovery : 'none';
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(track.durationSeconds ?? 0);
  const lastSecondRef = useRef(-1);
  // Latest callback without resubscribing every render.
  const cbRef = useRef(onTimeSecond);
  cbRef.current = onTimeSecond;

  // Track the global playhead only while this card's track is the one loaded.
  useEffect(() => {
    if (!active) {
      setCurrent(0);
      lastSecondRef.current = -1;
      return;
    }
    setCurrent(player.getCurrentTime());
    const d = player.getDuration();
    if (d > 0) setDuration(d);
    return player.subscribeTime((t, dur) => {
      setCurrent(t);
      if (dur > 0) setDuration(dur);
      const sec = Math.floor(t);
      if (sec !== lastSecondRef.current) {
        lastSecondRef.current = sec;
        cbRef.current?.(sec);
      }
    });
    // player's accessors are stable; re-run only when active flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track.key]);

  function togglePlay() {
    if (active) player.toggle();
    else player.play(track, { queue });
  }

  // Seek here if playing, start here from that spot if not.
  function seekTo(seconds: number) {
    player.seekTrack(track, seconds, queue);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8E0D0] text-[#2A2420] transition hover:bg-white"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="relative min-w-0 flex-1">
          {/* Space above the waveform for comment avatars. */}
          <div className="relative h-6">
            {duration > 0 &&
              markers.map((m) => {
                const pct = Math.max(0, Math.min(100, (m.timestampSeconds / duration) * 100));
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={`${m.authorName} @ ${fmt(m.timestampSeconds)}: ${m.body}`}
                    onClick={() => seekTo(m.timestampSeconds)}
                    style={{ left: `${pct}%` }}
                    className="group absolute top-0 -translate-x-1/2"
                  >
                    <MarkerAvatar name={m.authorName} avatarUrl={m.avatarUrl} />
                    <span className="absolute left-1/2 top-full h-1.5 w-px -translate-x-1/2 bg-[#c8a26a]/60" />
                  </button>
                );
              })}
          </div>
          <Waveform
            peaks={track.peaks ?? []}
            height={height}
            progress={active && duration > 0 ? current / duration : 0}
            onSeek={(frac) => {
              if (duration > 0) seekTo(frac * duration);
              else player.play(track, { queue });
            }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-[#E8E0D0]/50">
          {fmt(current)} / {fmt(duration)}
        </span>
      </div>
      {recovery === 'loading' && (
        <p className="mt-2 text-xs text-[#c8a26a]/80">
          Audio isn&apos;t loading the normal way — trying a fallback…
        </p>
      )}
      {recovery === 'undecodable' && (
        <p className="mt-2 rounded border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 px-3 py-2 text-xs text-[#F5A3A3]">
          This browser can&apos;t decode this recording — it may be in a format (like
          Apple Lossless) that only Safari plays. Ask the uploader to re-upload it.
        </p>
      )}
      {recovery === 'failed' && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 px-3 py-2 text-xs text-[#F5A3A3]">
          <span>
            Audio isn&apos;t loading — usually the browser, not the track. If retrying
            doesn&apos;t help, restart your browser or pause ad-block extensions.
          </span>
          <button
            type="button"
            onClick={player.retryRecovery}
            className="shrink-0 rounded border border-[#F5A3A3]/50 px-2 py-1 font-medium transition hover:bg-[#F5A3A3]/20"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function MarkerAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <span className="block h-5 w-5 overflow-hidden rounded-full border border-[#c8a26a] bg-[#2A2420] ring-2 ring-[#2A2420] transition group-hover:scale-110">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-[#E8E0D0]/80">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
