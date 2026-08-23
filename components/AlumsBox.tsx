'use client';

import { useState } from 'react';
import Link from 'next/link';

const PREVIEW_COUNT = 10;

export type AlumBand = {
  name: string;
  count: number;
  slug?: string;
};

function AlumRow({ band, rank, wide }: { band: AlumBand; rank: number; wide?: boolean }) {
  return (
    <div
      className={`flex justify-between items-baseline gap-2 py-1 border-b border-ink/15 ${
        wide ? 'break-inside-avoid' : ''
      }`}
    >
      <span className="flex items-baseline gap-2 min-w-0">
        <span
          className={`font-mono text-xs flex-shrink-0 w-6 text-right ${
            rank < 3 ? 'text-vhs-red' : 'text-ink/40'
          }`}
        >
          {rank + 1}
        </span>
        {band.slug ? (
          <Link
            href={`/bands/${band.slug}`}
            className={`text-sm truncate hover:underline ${
              rank < 3 ? 'font-semibold' : 'text-ink/80'
            }`}
          >
            {band.name}
          </Link>
        ) : (
          <span className={`text-sm truncate ${rank < 3 ? 'font-semibold' : 'text-ink/80'}`}>
            {band.name}
          </span>
        )}
      </span>
      {band.count > 1 && (
        <span className="text-xs text-vhs-blue font-mono flex-shrink-0">×{band.count}</span>
      )}
    </div>
  );
}

// Owns the home page's alums + hero-photo section: the photo column comes in as
// `children` so it stays server-rendered, and hides when the list expands to
// full width.
export default function AlumsBox({
  bands,
  setCount,
  children,
}: {
  bands: AlumBand[];
  setCount: number;
  children?: React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const expanded = showAll && bands.length > 0;

  return (
    <div className="w-full max-w-6xl mx-auto px-8 mb-12 grid gap-6 md:grid-cols-2 md:items-stretch">
      {bands.length > 0 && (
        <div
          className={`flex flex-col border-2 border-ink bg-paper-deep shadow-hard ${
            expanded ? 'md:col-span-2' : 'md:h-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowAll((open) => !open)}
            aria-expanded={expanded}
            className="group flex w-full items-baseline justify-between gap-3 border-b-2 border-ink px-5 py-3 text-left transition-colors hover:bg-ink/5"
          >
            <span className="min-w-0">
              <span className="font-mono font-bold text-base tracking-wide">BIRDHAUS ALUMS</span>
              <span className="ml-3 text-ink/50 text-sm">
                {bands.length} bands · {setCount} sets
              </span>
            </span>
            <span className="flex-shrink-0 font-mono text-xs uppercase tracking-widest text-vhs-red group-hover:underline">
              {expanded ? 'Hide ▾' : `Show all ${bands.length} →`}
            </span>
          </button>
          {expanded ? (
            <div className="px-5 py-3 columns-2 sm:columns-3 gap-x-6">
              {bands.map((band, i) => (
                <AlumRow key={band.name} band={band} rank={i} wide />
              ))}
            </div>
          ) : (
            // min-h-0 + overflow-hidden so the preview clips to whatever height
            // the photo column sets, keeping the two edges flush.
            <div className="flex-1 min-h-0 overflow-hidden px-5 py-3">
              {bands.slice(0, PREVIEW_COUNT).map((band, i) => (
                <AlumRow key={band.name} band={band} rank={i} />
              ))}
            </div>
          )}
        </div>
      )}
      {!expanded && children}
    </div>
  );
}
