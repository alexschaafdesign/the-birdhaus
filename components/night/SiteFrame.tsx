import type { ReactNode } from 'react';
import { RailHeader } from '@/components/ui/RailHeader';
import { NAV, TAGLINE } from './nav';
import { AccountSlot } from './AccountSlot';

// The 2027 page shell: /archive, /shows/[id] and /contact share it, matching
// the home page (/, which lays out its own header around the disco ball):
// paper ground, CommitMono, the rail header (fed the archive's own computed
// totals), the tagline + counts row under it, and the footer's account slot.

export function SiteFrame({
  stats,
  navPath,
  children,
}: {
  stats: { bands: number; sets: number } | null;
  /** The path the nav treats as current, when it isn't the URL (an archived
   *  night at /shows/BH-… belongs under ARCHIVE). */
  navPath?: string;
  children: ReactNode;
}) {
  return (
    <main
      className="bg-surface-paper text-surface-ink font-commit-mono flex min-h-screen flex-col gap-10 overflow-x-clip px-4 pt-6 pb-12 sm:px-8"
      style={{ WebkitTextStroke: 0 }}
    >
      <div className="flex flex-col [--rail-h:--spacing(1)]">
        <RailHeader entries={NAV} homeHref="/" tagline={TAGLINE} stats={stats} pathname={navPath} />
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
      <SiteFooter />
    </main>
  );
}

// The page foot: a hairline, then the account slot (Log in, or the signed-in
// links). mt-auto pins it to the bottom of a short page.
export function SiteFooter() {
  return (
    <footer className="border-surface-ink/20 mt-auto border-t pt-4">
      <AccountSlot />
    </footer>
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
