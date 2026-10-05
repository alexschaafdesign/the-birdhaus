import type { ReactNode } from 'react';
import { RailHeader } from '@/components/ui/RailHeader';
import { NAV, TAGLINE } from '../../home/nav';

// The page shell both archive routes share, matching /redesign/home: paper
// ground, CommitMono, the rail header (fed the archive's own computed totals)
// and the tagline + counts row under it.

export function ArchiveFrame({
  stats,
  children,
}: {
  stats: { bands: number; sets: number } | null;
  children: ReactNode;
}) {
  return (
    <main
      className="bg-surface-paper text-surface-ink font-commit-mono flex min-h-screen flex-col gap-10 overflow-x-clip px-4 pt-6 pb-12 sm:px-8"
      style={{ WebkitTextStroke: 0 }}
    >
      <div className="flex flex-col [--rail-h:--spacing(1)]">
        {/* TODO(launch): homeHref → / once this replaces the live home. */}
        <RailHeader entries={NAV} homeHref="/redesign/home" tagline={TAGLINE} stats={stats} />
        <div className="text-body-3 mt-3 flex flex-wrap justify-between gap-x-8 gap-y-1">
          <p className="leading-normal">{TAGLINE}</p>
          {stats && (
            <p className="text-accent-red leading-[1.5] font-bold">
              {stats.bands} BANDS · {stats.sets} SETS
            </p>
          )}
        </div>
      </div>
      {children}
    </main>
  );
}

// A full-bleed ink band: cancels the page gutter, then restores it inside, so
// only the media goes dark while headers and credits stay on paper.
export function NightBand({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`bg-surface-ink text-text-secondary -mx-4 flex flex-col gap-6 px-4 py-8 sm:-mx-8 sm:px-8 sm:py-10 ${className}`}
    >
      {children}
    </section>
  );
}
