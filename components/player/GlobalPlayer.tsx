'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PlayerTrack } from '@/lib/player-tracks';

// The site-wide player: ONE audio engine behind a context, mounted in the root
// layout so playback survives client-side navigation. Every play surface (Song
// Club waveforms, band list rows, version cards) routes through here, which
// also gives us Spotify semantics for free: starting anything replaces
// whatever was playing, and the queue a surface passes along keeps
// auto-advance working after the page that started it is gone. The bottom bar
// (components/player/PlayerBar) is this context's always-visible face.
//
// Stall recovery (ported from the old per-card WaveformPlayer): some browser
// states (a wedged media process after a Chrome update, media-filtering
// extensions) silently hang <audio> loads while fetch() and the Web Audio API
// still work. If play produces no audio within a grace period (or the media
// element errors), we fetch the bytes via the route's ?proxy=1 mode
// (same-origin, no CORS), decode with decodeAudioData, and play through an
// AudioBufferSourceNode — a separate pipeline from the media element. Only if
// THAT fails does the member see an error + retry.

export type PlayerRecovery = 'none' | 'loading' | 'failed' | 'undecodable';

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

export interface GlobalPlayerApi {
  current: PlayerTrack | null;
  // True while the current track is audibly playing (or trying to).
  playing: boolean;
  // True between asking for play and audio actually coming out.
  loading: boolean;
  recovery: PlayerRecovery;
  queue: PlayerTrack[];
  // Start a track (or resume it if it's already current). `queue` replaces the
  // auto-advance list; without one, an unknown track becomes a queue of one.
  // `at` starts playback from that second.
  play: (track: PlayerTrack, opts?: { queue?: PlayerTrack[]; at?: number }) => void;
  toggle: () => void;
  pause: () => void;
  // Seek within the CURRENT track.
  seek: (seconds: number) => void;
  // Seek if `track` is current, otherwise start it from that spot.
  seekTrack: (track: PlayerTrack, seconds: number, queue?: PlayerTrack[]) => void;
  next: () => void;
  prev: () => void;
  // Stop and dismiss the bar.
  close: () => void;
  retryRecovery: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  // Time updates OUTSIDE React state (≈4–5/sec) so only surfaces that show a
  // playhead re-render; returns an unsubscribe.
  subscribeTime: (cb: (time: number, duration: number) => void) => () => void;
}

const GlobalPlayerContext = createContext<GlobalPlayerApi | null>(null);

export function useGlobalPlayer(): GlobalPlayerApi {
  const ctx = useContext(GlobalPlayerContext);
  if (!ctx) throw new Error('useGlobalPlayer must be used inside GlobalPlayerProvider');
  return ctx;
}

export function GlobalPlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState<PlayerRecovery>('none');
  const [queue, setQueue] = useState<PlayerTrack[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<PlayerTrack | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const engineRef = useRef<WebAudioEngine | null>(null);
  const waModeRef = useRef(false);
  // The media element reported an error. We don't recover on sight — we
  // recover when the member actually asks to play.
  const mediaErrorRef = useRef(false);
  const recoveringRef = useRef(false);
  // Play was requested and hasn't been paused/ended — used to decide whether a
  // media error should trigger recovery immediately.
  const intendPlayRef = useRef(false);
  const stallTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  // A seek asked for before the media element has metadata.
  const pendingSeekRef = useRef<number | null>(null);
  const subscribersRef = useRef(new Set<(time: number, duration: number) => void>());

  // ---- time reporting ------------------------------------------------------

  function waNow(e: WebAudioEngine): number {
    return e.playing ? e.offset + (e.ctx.currentTime - e.startedAt) : e.offset;
  }

  const getCurrentTime = useCallback(() => {
    const e = engineRef.current;
    if (waModeRef.current && e) return Math.min(waNow(e), e.buffer.duration);
    return audioRef.current?.currentTime ?? 0;
  }, []);

  const getDuration = useCallback(() => {
    const e = engineRef.current;
    if (waModeRef.current && e) return e.buffer.duration;
    const d = audioRef.current?.duration;
    if (d !== undefined && Number.isFinite(d) && d > 0) return d;
    return currentRef.current?.durationSeconds ?? 0;
  }, []);

  const subscribeTime = useCallback((cb: (time: number, duration: number) => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  function emitTime() {
    const t = getCurrentTime();
    const d = getDuration();
    for (const cb of subscribersRef.current) cb(t, d);
  }

  // ---- Web Audio fallback engine -------------------------------------------

  function startTick() {
    if (tickRef.current !== null) return;
    tickRef.current = window.setInterval(() => {
      if (engineRef.current?.playing) emitTime();
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
      emitTime();
      handleEnded();
    };
    e.ctx.resume().catch(() => {});
    src.start(0, offset);
    e.source = src;
    e.offset = offset;
    e.startedAt = e.ctx.currentTime;
    e.playing = true;
    intendPlayRef.current = true;
    setPlaying(true);
    setLoading(false);
    emitTime();
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
      emitTime();
    }
  }

  function teardownEngine() {
    stopTick();
    const e = engineRef.current;
    if (e) {
      try {
        e.source?.stop();
      } catch {}
      e.ctx.close().catch(() => {});
      engineRef.current = null;
    }
    waModeRef.current = false;
  }

  async function startRecovery() {
    const track = currentRef.current;
    if (!track || recoveringRef.current) return;
    recoveringRef.current = true;
    setRecovery('loading');
    // Where the media element got to before it wedged — resume there.
    const resumeAt = audioRef.current?.currentTime ?? 0;
    audioRef.current?.pause();
    try {
      const sep = track.url.includes('?') ? '&' : '?';
      const res = await fetch(`${track.url}${sep}proxy=1`);
      if (!res.ok) throw new Error(`proxy fetch failed (${res.status})`);
      const bytes = await res.arrayBuffer();
      // The track may have been switched while we were downloading.
      if (currentRef.current?.key !== track.key) return;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(bytes);
      } catch {
        // The bytes came through but this browser has no decoder for them —
        // a codec problem with the file, not a flaky load.
        ctx.close().catch(() => {});
        setRecovery('undecodable');
        setLoading(false);
        setPlaying(false);
        return;
      }
      if (currentRef.current?.key !== track.key) {
        ctx.close().catch(() => {});
        return;
      }
      engineRef.current = { ctx, buffer, source: null, startedAt: 0, offset: 0, playing: false };
      waModeRef.current = true;
      setRecovery('none');
      emitTime();
      // The member already hit play — resume for them.
      waPlay(resumeAt);
    } catch {
      if (currentRef.current?.key === track.key) {
        setRecovery('failed');
        setLoading(false);
        setPlaying(false);
      }
    } finally {
      recoveringRef.current = false;
    }
  }

  // ---- the media element (normal path) -------------------------------------

  function clearStallTimer() {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  function ensureAudio(): HTMLAudioElement {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('play', () => {
      if (waModeRef.current) return;
      setPlaying(true);
      // If nothing has actually played 5s from now, the audio isn't coming
      // through the media element — recover via fetch + Web Audio.
      clearStallTimer();
      stallTimerRef.current = window.setTimeout(() => {
        stallTimerRef.current = null;
        if (!audio.paused && audio.currentTime < 0.1 && audio.readyState < 2) {
          audio.pause();
          void startRecovery();
        }
      }, 5000);
    });
    audio.addEventListener('playing', () => {
      if (waModeRef.current) return;
      setLoading(false);
      setPlaying(true);
    });
    audio.addEventListener('waiting', () => {
      if (waModeRef.current) return;
      setLoading(true);
    });
    audio.addEventListener('pause', () => {
      if (waModeRef.current) return;
      setPlaying(false);
      setLoading(false);
    });
    audio.addEventListener('ended', () => {
      if (waModeRef.current) return;
      setPlaying(false);
      emitTime();
      handleEnded();
    });
    audio.addEventListener('error', () => {
      if (waModeRef.current) return;
      clearStallTimer();
      mediaErrorRef.current = true;
      setPlaying(false);
      // If a play was underway, recover now; otherwise remember the element is
      // broken and recover when the member next hits play.
      if (intendPlayRef.current) void startRecovery();
      else setLoading(false);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (waModeRef.current) return;
      const p = pendingSeekRef.current;
      if (p !== null) {
        pendingSeekRef.current = null;
        try {
          audio.currentTime = p;
        } catch {}
      }
      emitTime();
    });
    audio.addEventListener('timeupdate', () => {
      if (waModeRef.current) return;
      if (audio.currentTime > 0) {
        clearStallTimer();
        setRecovery((r) => (r === 'none' ? r : 'none'));
      }
      emitTime();
    });
    audioRef.current = audio;
    return audio;
  }

  // ---- queue / transport ----------------------------------------------------

  function setQueueBoth(next: PlayerTrack[]) {
    queueRef.current = next;
    setQueue(next);
  }

  function handleEnded() {
    const cur = currentRef.current;
    const q = queueRef.current;
    const i = cur ? q.findIndex((t) => t.key === cur.key) : -1;
    const nextTrack = i >= 0 ? q[i + 1] : undefined;
    if (nextTrack) playTrack(nextTrack);
    else intendPlayRef.current = false;
  }

  function seekInternal(seconds: number) {
    if (waModeRef.current) return waSeek(seconds);
    const audio = audioRef.current;
    if (!audio) return;
    const s = Math.max(0, seconds);
    if (audio.readyState >= 1) {
      try {
        audio.currentTime = s;
      } catch {}
    } else {
      pendingSeekRef.current = s;
    }
    emitTime();
  }

  function playTrack(track: PlayerTrack, opts?: { queue?: PlayerTrack[]; at?: number }) {
    if (!track.url) return;
    const audio = ensureAudio();
    const same = currentRef.current?.key === track.key;

    if (opts?.queue) setQueueBoth(opts.queue);
    else if (!same && !queueRef.current.some((t) => t.key === track.key)) setQueueBoth([track]);

    if (same) {
      // Resume (optionally from a new spot) rather than restart.
      if (opts?.at !== undefined) seekInternal(opts.at);
      if (waModeRef.current) {
        if (!engineRef.current?.playing) waPlay();
      } else if (mediaErrorRef.current) {
        intendPlayRef.current = true;
        void startRecovery();
      } else if (audio.paused) {
        intendPlayRef.current = true;
        setLoading(true);
        audio.play().catch(() => setLoading(false));
      }
      return;
    }

    // New track: back to the normal media-element path even if the previous
    // track was living on the Web Audio fallback.
    teardownEngine();
    clearStallTimer();
    mediaErrorRef.current = false;
    recoveringRef.current = false;
    setRecovery('none');
    currentRef.current = track;
    setCurrent(track);
    pendingSeekRef.current = null;
    intendPlayRef.current = true;
    setLoading(true);
    setPlaying(false);
    audio.src = track.url;
    if (opts?.at !== undefined) pendingSeekRef.current = opts.at;
    audio.play().catch(() => setLoading(false));
    emitTime();
  }

  function pause() {
    intendPlayRef.current = false;
    if (waModeRef.current) waPause();
    else audioRef.current?.pause();
  }

  function toggle() {
    const cur = currentRef.current;
    if (!cur) return;
    if (waModeRef.current) {
      if (engineRef.current?.playing) waPause();
      else waPlay();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      intendPlayRef.current = false;
      audio.pause();
    } else if (mediaErrorRef.current) {
      intendPlayRef.current = true;
      void startRecovery();
    } else {
      intendPlayRef.current = true;
      setLoading(true);
      audio.play().catch(() => setLoading(false));
    }
  }

  function seekTrack(track: PlayerTrack, seconds: number, q?: PlayerTrack[]) {
    if (currentRef.current?.key === track.key) seekInternal(seconds);
    else playTrack(track, { queue: q, at: seconds });
  }

  function next() {
    const cur = currentRef.current;
    const q = queueRef.current;
    const i = cur ? q.findIndex((t) => t.key === cur.key) : -1;
    const nextTrack = i >= 0 ? q[i + 1] : undefined;
    if (nextTrack) playTrack(nextTrack);
  }

  function prev() {
    const cur = currentRef.current;
    const q = queueRef.current;
    const i = cur ? q.findIndex((t) => t.key === cur.key) : -1;
    const prevTrack = i > 0 ? q[i - 1] : undefined;
    // Spotify semantics: early in the track goes to the previous one,
    // otherwise restart the current one.
    if (prevTrack && getCurrentTime() <= 3) playTrack(prevTrack);
    else seekInternal(0);
  }

  function close() {
    intendPlayRef.current = false;
    clearStallTimer();
    teardownEngine();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    currentRef.current = null;
    setCurrent(null);
    setQueueBoth([]);
    setPlaying(false);
    setLoading(false);
    setRecovery('none');
  }

  function retryRecovery() {
    intendPlayRef.current = true;
    void startRecovery();
  }

  // Lock-screen / hardware-key controls where the browser supports them.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      if (current && typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: current.title,
          artist: current.subtitle ?? '',
          album: 'the BIRDHAUS',
        });
      }
      ms.playbackState = current ? (playing ? 'playing' : 'paused') : 'none';
      ms.setActionHandler('play', () => toggle());
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('previoustrack', () => prev());
      ms.setActionHandler('nexttrack', () => next());
      ms.setActionHandler('seekto', (d) => {
        if (typeof d.seekTime === 'number') seekInternal(d.seekTime);
      });
    } catch {}
    // The handlers only touch refs, so re-registering per change is cheap and
    // never stale.
  }, [current, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release everything if the provider itself ever unmounts.
  useEffect(
    () => () => {
      stopTick();
      const e = engineRef.current;
      if (e) {
        try {
          e.source?.stop();
        } catch {}
        e.ctx.close().catch(() => {});
      }
      audioRef.current?.pause();
    },
    []
  );

  const value: GlobalPlayerApi = {
    current,
    playing,
    loading,
    recovery,
    queue,
    play: playTrack,
    toggle,
    pause,
    seek: seekInternal,
    seekTrack,
    next,
    prev,
    close,
    retryRecovery,
    getCurrentTime,
    getDuration,
    subscribeTime,
  };

  return <GlobalPlayerContext.Provider value={value}>{children}</GlobalPlayerContext.Provider>;
}
