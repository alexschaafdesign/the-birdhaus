'use client';

import { useEffect, useRef, useState } from 'react';
import type WaveSurferType from 'wavesurfer.js';

// Samply-style waveform player built on wavesurfer.js. Draws from precomputed
// peaks (no re-download/decode of the audio; playback streams from the url via
// a media element, which needs no CORS). Exposes play/pause controls to the
// parent so a playlist can pause siblings and auto-advance.
//
// Stall recovery: some browser states (a wedged media process after a Chrome
// update, media-filtering extensions) silently hang <audio> loads — even from
// an in-memory blob — while fetch() and the Web Audio API still work. If play
// produces no audio within a grace period (or the media element errors), the
// player fetches the bytes itself via the route's ?proxy=1 mode (same-origin,
// so no CORS), decodes them with decodeAudioData, and plays through an
// AudioBufferSourceNode — a completely separate pipeline from the media
// element. In that mode a small engine below handles play/pause/seek/progress
// (wavesurfer's UI is driven by the dead media element, so we overlay our
// own progress). Only if THAT fails does the member see an error + retry.
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

// Fallback-mode playback state (Web Audio). `offset` is seconds into the
// buffer when playback last started/paused; position while playing is
// offset + (ctx.currentTime - startedAt).
type WebAudioEngine = {
  ctx: AudioContext;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  startedAt: number;
  offset: number;
  playing: boolean;
};

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
  // 'loading' = the normal path stalled, fetching + decoding for Web Audio
  // playback; 'failed' = the fallback failed too — show the error + retry.
  const [recovery, setRecovery] = useState<'none' | 'loading' | 'failed'>('none');
  // True once playback runs on the Web Audio engine instead of wavesurfer.
  const [waMode, setWaMode] = useState(false);
  const waModeRef = useRef(false);
  const engineRef = useRef<WebAudioEngine | null>(null);
  const recoveringRef = useRef(false);
  // The media element reported an error (can happen at LOAD, before any play
  // click, in broken-browser states). We don't recover on sight — that would
  // auto-download every track on the page — we recover when the member
  // actually asks to play.
  const mediaErrorRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const lastSecondRef = useRef(-1);
  // Latest callbacks without re-initializing wavesurfer on every render.
  const cbRef = useRef({ onPlay, onEnded, onTimeSecond, registerControls });
  cbRef.current = { onPlay, onEnded, onTimeSecond, registerControls };

  // ---- Web Audio fallback engine -----------------------------------------

  function waNow(e: WebAudioEngine): number {
    return e.playing ? e.offset + (e.ctx.currentTime - e.startedAt) : e.offset;
  }

  function startTick() {
    if (tickRef.current !== null) return;
    tickRef.current = window.setInterval(() => {
      const e = engineRef.current;
      if (!e || !e.playing) return;
      const t = Math.min(waNow(e), e.buffer.duration);
      setCurrent(t);
      const sec = Math.floor(t);
      if (sec !== lastSecondRef.current) {
        lastSecondRef.current = sec;
        cbRef.current.onTimeSecond?.(sec);
      }
    }, 200);
  }

  function stopTick() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function waPlay(fromOffset?: number) {
    const e = engineRef.current;
    if (!e) return;
    // Replace any live source (seek-while-playing restarts from the new spot).
    if (e.source) {
      const old = e.source;
      e.source = null;
      try {
        old.stop();
      } catch {}
      old.disconnect();
    }
    const offset = Math.max(0, Math.min(fromOffset ?? e.offset, e.buffer.duration - 0.01));
    const src = e.ctx.createBufferSource();
    src.buffer = e.buffer;
    src.connect(e.ctx.destination);
    src.onended = () => {
      // Fires for stop() too — only treat as "track finished" if still live.
      if (e.source !== src) return;
      e.source = null;
      e.playing = false;
      e.offset = 0;
      stopTick();
      setPlaying(false);
      setCurrent(e.buffer.duration);
      cbRef.current.onEnded?.();
    };
    e.ctx.resume().catch(() => {});
    src.start(0, offset);
    e.source = src;
    e.offset = offset;
    e.startedAt = e.ctx.currentTime;
    e.playing = true;
    setPlaying(true);
    setCurrent(offset);
    cbRef.current.onPlay?.();
    startTick();
    // Autoplay policy can leave the context suspended when the play gesture
    // has gone stale — settle back to paused so the next tap (a fresh
    // gesture) starts it.
    window.setTimeout(() => {
      if (engineRef.current === e && e.playing && e.ctx.state === 'suspended') waPause();
    }, 400);
  }

  function waPause() {
    const e = engineRef.current;
    if (!e || !e.playing) return;
    e.offset = Math.min(waNow(e), e.buffer.duration);
    e.playing = false;
    if (e.source) {
      const src = e.source;
      e.source = null;
      try {
        src.stop();
      } catch {}
      src.disconnect();
    }
    stopTick();
    setPlaying(false);
  }

  function waSeek(seconds: number) {
    const e = engineRef.current;
    if (!e) return;
    const clamped = Math.max(0, Math.min(seconds, e.buffer.duration));
    if (e.playing) waPlay(clamped);
    else {
      e.offset = clamped;
      setCurrent(clamped);
    }
  }

  async function startRecovery() {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    setRecovery('loading');
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}proxy=1`);
      if (!res.ok) throw new Error(`proxy fetch failed (${res.status})`);
      const bytes = await res.arrayBuffer();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(bytes);
      } catch (err) {
        ctx.close().catch(() => {});
        throw err;
      }
      engineRef.current = { ctx, buffer, source: null, startedAt: 0, offset: 0, playing: false };
      waModeRef.current = true;
      setWaMode(true);
      setDuration(buffer.duration);
      setRecovery('none');
      // The member already hit play — resume for them.
      waPlay(0);
    } catch {
      setRecovery('failed');
    } finally {
      recoveringRef.current = false;
    }
  }

  // Release the engine when the card unmounts.
  useEffect(
    () => () => {
      stopTick();
      const e = engineRef.current;
      if (e) {
        try {
          e.source?.stop();
        } catch {}
        e.ctx.close().catch(() => {});
        engineRef.current = null;
      }
    },
    []
  );

  // ---- wavesurfer (normal path) ------------------------------------------

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

      const clearStallTimer = () => {
        if (stallTimerRef.current !== null) {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      };

      ws.on('play', () => {
        if (waModeRef.current) return;
        setPlaying(true);
        cbRef.current.onPlay?.();
        // If nothing has actually played 5s from now, the audio isn't coming
        // through the media element — recover via fetch + Web Audio.
        clearStallTimer();
        stallTimerRef.current = window.setTimeout(() => {
          stallTimerRef.current = null;
          const media = ws.getMediaElement();
          if (ws.isPlaying() && ws.getCurrentTime() < 0.1 && (media?.readyState ?? 0) < 2) {
            ws.pause();
            void startRecovery();
          }
        }, 5000);
      });
      ws.on('pause', () => {
        if (!waModeRef.current) setPlaying(false);
      });
      ws.on('finish', () => {
        if (waModeRef.current) return;
        setPlaying(false);
        cbRef.current.onEnded?.();
      });
      ws.on('error', () => {
        if (waModeRef.current) return;
        clearStallTimer();
        // If a play was underway, recover now; otherwise just remember the
        // media element is broken and recover when the member hits play.
        const wasPlaying = ws.isPlaying();
        mediaErrorRef.current = true;
        setPlaying(false);
        if (wasPlaying) void startRecovery();
      });
      ws.on('timeupdate', (t: number) => {
        if (waModeRef.current) return;
        setCurrent(t);
        if (t > 0) {
          clearStallTimer();
          setRecovery('none');
        }
        const sec = Math.floor(t);
        if (sec !== lastSecondRef.current) {
          lastSecondRef.current = sec;
          cbRef.current.onTimeSecond?.(sec);
        }
      });
      ws.on('ready', (d: number) => {
        if (!waModeRef.current) setDuration(d);
      });

      cbRef.current.registerControls?.({
        play: () => {
          if (waModeRef.current) return waPlay();
          if (mediaErrorRef.current) return void startRecovery();
          ws.play();
        },
        pause: () => (waModeRef.current ? waPause() : ws.pause()),
        seek: (seconds: number) => {
          if (waModeRef.current) return waSeek(seconds);
          const d = ws.getDuration() || durationSeconds || 0;
          if (d > 0) ws.seekTo(Math.max(0, Math.min(1, seconds / d)));
        },
        getCurrentTime: () =>
          waModeRef.current && engineRef.current
            ? waNow(engineRef.current)
            : ws.getCurrentTime(),
      });
    })();

    return () => {
      destroyed = true;
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      cbRef.current.registerControls?.(null);
      wsRef.current?.destroy();
      wsRef.current = null;
    };
    // Re-init only if the audio itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function togglePlay() {
    if (waModeRef.current) {
      if (engineRef.current?.playing) waPause();
      else waPlay();
    } else if (mediaErrorRef.current) {
      // Media element already known-broken — skip straight to recovery.
      void startRecovery();
    } else {
      wsRef.current?.playPause();
    }
  }

  // In fallback mode the wavesurfer cursor is dead (it tracks the media
  // element) — clicks on the waveform seek our engine instead.
  function waveformClickSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!waModeRef.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    waSeek(frac * duration);
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
                  onClick={() => {
                    if (waModeRef.current) waSeek(m.timestampSeconds);
                    else wsRef.current?.seekTo(pct / 100);
                  }}
                  style={{ left: `${pct}%` }}
                  className="group absolute top-0 -translate-x-1/2"
                >
                  <MarkerAvatar name={m.authorName} avatarUrl={m.avatarUrl} />
                  <span className="absolute left-1/2 top-full h-1.5 w-px -translate-x-1/2 bg-[#c8a26a]/60" />
                </button>
              );
            })}
        </div>
        <div className="relative" onClick={waveformClickSeek}>
          <div ref={containerRef} className="w-full cursor-pointer" />
          {waMode && duration > 0 && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="h-full border-r-2 border-[#E8E0D0]/90 bg-[#c8a26a]/25"
                style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
              />
            </div>
          )}
        </div>
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
    {recovery === 'failed' && (
      <div className="mt-2 flex items-center justify-between gap-3 rounded border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 px-3 py-2 text-xs text-[#F5A3A3]">
        <span>
          Audio isn&apos;t loading — usually the browser, not the track. If retrying
          doesn&apos;t help, restart your browser or pause ad-block extensions.
        </span>
        <button
          type="button"
          onClick={() => void startRecovery()}
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
