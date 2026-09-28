'use client';

import { useEffect, useRef } from 'react';

// Canvas rendering of a track's precomputed peaks, in the bar style wavesurfer
// used to draw (2px bars, 1px gap, mirrored around the vertical center) — but
// with no audio of its own: it's a pure view + seek surface for the global
// player. Two stacked canvases: the cream base, and a gold copy clipped to the
// played fraction (with the cursor as the clip edge).
export default function Waveform({
  peaks,
  height,
  // 0..1 of the track played; 0 hides the cursor.
  progress,
  onSeek,
}: {
  peaks: number[];
  height: number;
  progress: number;
  onSeek: (fraction: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const progRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const draw = () => {
      const width = wrap.clientWidth;
      if (width <= 0) return;
      if (baseRef.current) drawPeaks(baseRef.current, peaks, width, height, 'rgba(232, 224, 208, 0.35)');
      if (progRef.current) drawPeaks(progRef.current, peaks, width, height, '#c8a26a');
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, height]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  }

  return (
    <div
      ref={wrapRef}
      onClick={handleClick}
      className="relative w-full cursor-pointer"
      style={{ height }}
    >
      <canvas ref={baseRef} className="absolute inset-0" />
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden ${
          progress > 0 ? 'border-r-2 border-[#E8E0D0]/90' : ''
        }`}
        style={{ width: `${Math.min(100, progress * 100)}%` }}
      >
        <canvas ref={progRef} className="absolute inset-y-0 left-0" />
      </div>
    </div>
  );
}

function drawPeaks(
  canvas: HTMLCanvasElement,
  peaks: number[],
  width: number,
  height: number,
  color: string
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  const barWidth = 2;
  const step = 3; // bar + 1px gap
  const bars = Math.max(1, Math.floor((width + (step - barWidth)) / step));
  const canRound = typeof ctx.roundRect === 'function';
  for (let i = 0; i < bars; i++) {
    // Max over this bar's slice of the peak buckets.
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(peaks[j] ?? 0));
    const h = Math.max(1, max * height);
    const x = i * step;
    const y = (height - h) / 2;
    if (canRound) {
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, 1);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, barWidth, h);
    }
  }
}
