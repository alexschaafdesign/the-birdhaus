'use client';

import { useState } from 'react';

// Live preview of the tube. Renders /tv in a scaled iframe; the buttons force a
// mode via ?mode= (so you can see each mode's authored content without changing
// what's actually live), or "Live" to follow the real program. For a per-show
// preview, ?showId= points the feed at that show's program regardless of date.

type PreviewMode = 'live' | 'screensaver' | 'board' | 'cards';
const OPTIONS: Array<{ key: PreviewMode; label: string }> = [
  { key: 'live', label: 'Live' },
  { key: 'screensaver', label: 'Screensaver' },
  { key: 'board', label: 'Board' },
  { key: 'cards', label: 'Cards' },
];

// The tube is 640×480; scale it into a tidy panel.
const SCALE = 0.6;
const W = 640;
const H = 480;

export default function TvPreview({ showId = null }: { showId?: number | null }) {
  const [mode, setMode] = useState<PreviewMode>('live');

  const params = new URLSearchParams();
  if (showId != null) params.set('showId', String(showId));
  if (mode !== 'live') params.set('mode', mode);
  params.set('scanlines', '1');
  const url = `/tv?${params.toString()}`;

  return (
    <div className="text-surface-ink">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h3 className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">Preview</h3>
        <div className="flex items-center gap-1 flex-wrap">
          {OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`text-data-caption-13 border  px-3 py-1.5 transition-colors ${
                mode === key
                  ? 'border-surface-ink bg-surface-paper-shade text-surface-ink'
                  : 'border-surface-ink text-surface-ink/80 hover:text-accent-red'
              }`}
            >
              {label}
            </button>
          ))}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline ml-1"
          >
            Open ↗
          </a>
        </div>
      </div>
      <div
        className="bg-surface-ink overflow-hidden border border-surface-ink/20"
        style={{ width: W * SCALE, height: H * SCALE }}
      >
        <iframe
          key={url}
          src={url}
          title="TV preview"
          width={W}
          height={H}
          style={{ border: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}
        />
      </div>
      <p className="text-data-caption-13 text-surface-ink/60 mt-2">
        {mode === 'live'
          ? 'Following the live program.'
          : `Forced to ${mode} for preview — the live tube is unchanged.`}
      </p>
    </div>
  );
}
