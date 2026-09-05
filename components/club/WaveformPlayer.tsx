'use client';

import { useEffect, useRef, useState } from 'react';
import type WaveSurferType from 'wavesurfer.js';

// Samply-style waveform player built on wavesurfer.js. Draws from precomputed
// peaks (no re-download/decode of the audio; playback streams from the url via
// a media element, which needs no CORS). Exposes play/pause controls to the
// parent so a playlist can pause siblings and auto-advance.
export interface TrackControls {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  getCurrentTime: () => number;
}

// A timestamped comment to pin on the waveform.
export interface WaveformMarker {
  id: number;
  timestampSeconds: number;
  authorName: string;
  avatarUrl: string | null;
  body: string;
}

export default function WaveformPlayer({
  url,
  peaks,
  durationSeconds,
  markers = [],
  onPlay,
  onEnded,
  onTimeSecond,
  registerControls,
}: {
  url: string;
  peaks: number[];
  durationSeconds: number | null;
  markers?: WaveformMarker[];
  onPlay?: () => void;
  onEnded?: () => void;
  onTimeSecond?: (sec: number) => void;
  registerControls?: (controls: TrackControls | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurferType | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const lastSecondRef = useRef(-1);
  // Latest callbacks without re-initializing wavesurfer on every render.
  const cbRef = useRef({ onPlay, onEnded, onTimeSecond, registerControls });
  cbRef.current = { onPlay, onEnded, onTimeSecond, registerControls };

  useEffect(() => {
    let destroyed = false;

    (async () => {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      if (destroyed || !containerRef.current) return;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        url,
        peaks: [peaks],
        duration: durationSeconds ?? undefined,
        height: 72,
        waveColor: 'rgba(232, 224, 208, 0.35)',
        progressColor: '#c8a26a',
        cursorColor: 'rgba(232, 224, 208, 0.9)',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: false,
      });
      wsRef.current = ws;

      ws.on('play', () => {
        setPlaying(true);
        cbRef.current.onPlay?.();
      });
      ws.on('pause', () => setPlaying(false));
      ws.on('finish', () => {
        setPlaying(false);
        cbRef.current.onEnded?.();
      });
      ws.on('timeupdate', (t: number) => {
        setCurrent(t);
        const sec = Math.floor(t);
        if (sec !== lastSecondRef.current) {
          lastSecondRef.current = sec;
          cbRef.current.onTimeSecond?.(sec);
        }
      });
      ws.on('ready', (d: number) => setDuration(d));

      cbRef.current.registerControls?.({
        play: () => ws.play(),
        pause: () => ws.pause(),
        seek: (seconds: number) => {
          const d = ws.getDuration() || durationSeconds || 0;
          if (d > 0) ws.seekTo(Math.max(0, Math.min(1, seconds / d)));
        },
        getCurrentTime: () => ws.getCurrentTime(),
      });
    })();

    return () => {
      destroyed = true;
      cbRef.current.registerControls?.(null);
      wsRef.current?.destroy();
      wsRef.current = null;
    };
    // Re-init only if the audio itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => wsRef.current?.playPause()}
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
                  onClick={() => wsRef.current?.seekTo(pct / 100)}
                  style={{ left: `${pct}%` }}
                  className="group absolute top-0 -translate-x-1/2"
                >
                  <MarkerAvatar name={m.authorName} avatarUrl={m.avatarUrl} />
                  <span className="absolute left-1/2 top-full h-1.5 w-px -translate-x-1/2 bg-[#c8a26a]/60" />
                </button>
              );
            })}
        </div>
        <div ref={containerRef} className="w-full cursor-pointer" />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-[#E8E0D0]/50">
        {fmt(current)} / {fmt(duration)}
      </span>
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
