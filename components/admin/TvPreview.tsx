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
    <div className="text-[#E8E0D0]">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h3 className="text-sm uppercase tracking-wide text-[#E8E0D0]/50">Preview</h3>
        <div className="flex items-center gap-1 flex-wrap">
          {OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`text-xs border rounded px-3 py-1.5 transition-colors ${
                mode === key
                  ? 'border-[#E8E0D0] bg-[#E8E0D0]/10 text-[#E8E0D0]'
                  : 'border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:text-[#E8E0D0]'
              }`}
            >
              {label}
            </button>
          ))}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline ml-1"
          >
            Open ↗
          </a>
        </div>
      </div>
      <div
        className="bg-black rounded overflow-hidden border border-[#E8E0D0]/15"
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
      <p className="text-xs text-[#E8E0D0]/40 mt-2">
        {mode === 'live'
          ? 'Following the live program.'
          : `Forced to ${mode} for preview — the live tube is unchanged.`}
      </p>
    </div>
  );
}
