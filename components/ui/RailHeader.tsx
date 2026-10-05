'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { BirdhausWordmark } from './BirdhausWordmark';
import { RailNav, activeRailItem, type RailNavEntry } from './RailNav';

// Birdhaus DS — Header (Figma 121:4273). One continuous rail runs the full
// width, --rail-h thick (set on an ancestor so the hanging disco ball can use
// the same value; falls back to 4px).
//
// Desktop (lg+): the wordmark over the five SMPTE bars (amber → violet, each
// space-16) and an ink rail; the RailNav items continue that rail edge to edge.
// Logo column and nav are bottom-aligned, logo and labels both space-3 above
// the rail, so the rails line up.
//
// Mobile: the short-tail wordmark and a menu button above the same rail (bars
// at space-8), so the colour bars always sit right under the wordmark. The
// button (aria-expanded / aria-controls) toggles the nav as one row directly
// under the rail — closed by default; at the 12px data size, spread edge to
// edge, so all five links fit one row. A full menu overlay comes later.
//
// The wordmark is a home link named "Birdhaus".

const BARS = [
  'bg-bars-6-amber',
  'bg-bars-5-orange',
  'bg-bars-4-red',
  'bg-bars-3-magenta',
  'bg-bars-2-violet',
] as const;

const RAIL = 'h-(--rail-h,--spacing(1))';

// The colour bars then the ink rail. barWidth is a literal class so Tailwind's
// scanner sees it (w-16 desktop, w-8 mobile).
function BrandRail({ barWidth, className = '' }: { barWidth: 'w-16' | 'w-8'; className?: string }) {
  return (
    <div className={`flex ${className}`} aria-hidden="true">
      {BARS.map((bg) => (
        <span key={bg} className={`shrink-0 ${barWidth} ${RAIL} ${bg}`} />
      ))}
      <span className={`bg-surface-ink flex-1 ${RAIL}`} />
    </div>
  );
}

export type RailHeaderProps = {
  entries: RailNavEntry[];
  homeHref: string;
  /** Overrides the current route (component gallery / specimens). */
  pathname?: string;
  className?: string;
};

export function RailHeader({ entries, homeHref, pathname, className = '' }: RailHeaderProps) {
  const current = usePathname();
  const path = pathname ?? current;
  const active = activeRailItem(entries, path);
  const [open, setOpen] = useState(false);
  const menuId = `${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-menu`;

  const home = (layout: 'horizontal' | 'short-tail', size: string) => (
    <Link
      href={homeHref}
      aria-label="Birdhaus"
      className="focus-visible:outline-accent-red block w-fit max-w-full focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <BirdhausWordmark layout={layout} className={`${size} max-w-full`} />
    </Link>
  );

  return (
    <header className={className}>
      {/* Desktop */}
      <div className="hidden items-end lg:flex">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {home('horizontal', 'w-96.5')}
          <BrandRail barWidth="w-16" />
        </div>
        <RailNav entries={entries} pathname={path} className="shrink-0" />
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-end justify-between gap-4">
          {home('short-tail', 'w-44.75')}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
            className="text-surface-ink hover:text-accent-red focus-visible:outline-accent-red -m-3 p-3 focus-visible:outline-2 motion-safe:transition-colors"
          >
            <span className="block size-4 bg-current mask-[url(/redesign/icons/menu.svg)] mask-contain mask-center mask-no-repeat" />
          </button>
        </div>
        <BrandRail barWidth="w-8" />
        <nav id={menuId} aria-label="Main" hidden={!open}>
          <ul className="flex flex-wrap justify-between gap-x-2 gap-y-2 sm:justify-start sm:gap-x-8.5">
            {entries.map((e, i) => (
              <li key={e.label}>
                <Link
                  href={e.href}
                  aria-current={i === active ? 'page' : undefined}
                  className={
                    'text-data-spec-12 sm:text-ui-nav-item-14 focus-visible:outline-accent-red block pt-1 pb-1.5 leading-[1.3] tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors ' +
                    (i === active
                      ? 'text-accent-red border-accent-red border-b-2'
                      : 'text-surface-ink hover:text-accent-red')
                  }
                >
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default RailHeader;
