'use client';

import { useState } from 'react';
import Link from 'next/link';

const PREVIEW_COUNT = 10;

export type AlumBand = {
  name: string;
  count: number;
  slug?: string;
};

export default function AlumsBox({ bands, setCount }: { bands: AlumBand[]; setCount: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? bands : bands.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col border-2 border-ink bg-paper-deep shadow-hard md:h-full">
      <div className="border-b-2 border-ink px-5 py-3">
        <span className="font-mono font-bold text-base tracking-wide">BIRDHAUS ALUMS</span>
        <span className="ml-3 text-ink/50 text-sm">
          {bands.length} bands · {setCount} sets and counting...
        </span>
      </div>
      {/* min-h-0 + overflow keep the expanded list scrolling inside the box, so
          the box stays the same height as the hero image next to it. */}
      <div
        className={`flex-1 min-h-0 px-5 py-3 ${
          showAll ? 'max-h-[60vh] overflow-y-auto md:max-h-none' : 'overflow-hidden'
        }`}
      >
        {visible.map((band, i) => (
          <div
            key={band.name}
            className="flex justify-between items-baseline gap-2 py-1 border-b border-ink/15"
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span
                className={`font-mono text-xs flex-shrink-0 w-6 text-right ${
                  i < 3 ? 'text-vhs-red' : 'text-ink/40'
                }`}
              >
                {i + 1}
              </span>
              {band.slug ? (
                <Link
                  href={`/bands/${band.slug}`}
                  className={`text-sm truncate hover:underline ${
                    i < 3 ? 'font-semibold' : 'text-ink/80'
                  }`}
                >
                  {band.name}
                </Link>
              ) : (
                <span className={`text-sm truncate ${i < 3 ? 'font-semibold' : 'text-ink/80'}`}>
                  {band.name}
                </span>
              )}
            </span>
            {band.count > 1 && (
              <span className="text-xs text-vhs-blue font-mono flex-shrink-0">×{band.count}</span>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShowAll((open) => !open)}
        className="border-t-2 border-ink px-5 py-2.5 text-left font-mono text-xs uppercase tracking-widest text-vhs-red transition-colors hover:bg-ink hover:text-paper"
      >
        {showAll ? 'Show fewer ▴' : `Show all ${bands.length} →`}
      </button>
    </div>
  );
}
