'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BirdhausWordmark } from './BirdhausWordmark';
import { MenuItem } from './MenuItem';
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
// button opens the mobile menu (Breakpoint = Mobile menu): a full-screen paper
// panel in a modal <dialog> whose masthead and rail sit exactly where the
// closed header's do (same padding as the page), so opening shifts nothing.
// Focus goes to the close button and is trapped in the panel; Escape, the
// close button or any link closes it and focus returns to the menu button
// (or to the body if it closed because the window widened to desktop). Page
// scroll is locked while open. The panel fades in and the rows rise slightly;
// nothing moves under prefers-reduced-motion.
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

const FOCUS =
  'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';

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

function HomeLink({
  href,
  layout,
  onNavigate,
}: {
  href: string;
  layout: 'horizontal' | 'short-tail';
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label="Birdhaus"
      className={`block w-fit max-w-full ${FOCUS}`}
    >
      <BirdhausWordmark
        layout={layout}
        className={`${layout === 'horizontal' ? 'w-96.5' : 'w-44.75'} max-w-full`}
      />
    </Link>
  );
}

// The masthead's icon button (menu / close): a 16px icon with the tap area
// grown by a negative-margin pad, so it doesn't change the masthead's height.
const ICON_BUTTON = `text-surface-ink hover:text-accent-red -m-3 p-3 motion-safe:transition-colors ${FOCUS}`;

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="block size-4" aria-hidden="true" focusable="false">
      <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export type HeaderStats = { bands: number; sets: number } | null;

export type MobileMenuPanelProps = {
  entries: RailNavEntry[];
  active: number;
  homeHref: string;
  tagline: string;
  stats?: HeaderStats;
  /** The close control, in the masthead where the menu button sits. */
  closeButton: ReactNode;
  onNavigate?: () => void;
};

// The open mobile menu's content (Figma: Header, Breakpoint = Mobile menu):
// masthead + rail exactly as the closed header, then the Menu Item rows, and
// the tagline + counts pinned to the bottom. Padding matches the page so the
// masthead and rail line up with the closed header's. Presentational; the
// dialog around it lives in RailHeader (the component gallery renders it bare).
export function MobileMenuPanel({
  entries,
  active,
  homeHref,
  tagline,
  stats,
  closeButton,
  onNavigate,
}: MobileMenuPanelProps) {
  return (
    <div className="flex min-h-full flex-col px-4 pt-6 pb-6 sm:px-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <HomeLink href={homeHref} layout="short-tail" onNavigate={onNavigate} />
          {closeButton}
        </div>
        <BrandRail barWidth="w-8" />
      </div>
      <ul className="pt-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:starting:translate-y-2">
        {entries.map((e, i) => (
          <MenuItem
            key={e.label}
            index={String(i + 1).padStart(2, '0')}
            label={e.label}
            href={e.href}
            active={i === active}
            external={e.external}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      <div className="min-h-8 flex-1" />
      <div className="flex flex-col gap-2">
        <p className="text-data-spec-12 text-text-primary leading-[1.45] tracking-[--spacing(0.25)]">
          {tagline}
        </p>
        {stats && (
          <p className="text-data-caption-13-bold text-accent-red leading-[1.4] font-bold tracking-[--spacing(0.375)]">
            {stats.bands} BANDS · {stats.sets} SETS
          </p>
        )}
      </div>
    </div>
  );
}

export type RailHeaderProps = {
  entries: RailNavEntry[];
  homeHref: string;
  /** Tagline + counts, shown at the bottom of the open mobile menu. */
  tagline: string;
  stats?: HeaderStats;
  /** Overrides the current route (component gallery / specimens). */
  pathname?: string;
  className?: string;
};

export function RailHeader({
  entries,
  homeHref,
  tagline,
  stats = null,
  pathname,
  className = '',
}: RailHeaderProps) {
  const current = usePathname();
  const active = activeRailItem(entries, pathname ?? current);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Where focus goes when the dialog closes: back to the menu button, or (when
  // it closed because the window widened to desktop) the body.
  const restoreFocus = useRef(true);
  const menuId = `${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-menu`;

  function openMenu() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    restoreFocus.current = true;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    setOpen(true);
    closeButtonRef.current?.focus();
  }

  function closeMenu(restore = true) {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    restoreFocus.current = restore;
    dialog.close(); // → onClose
  }

  // Runs for every close path (button, link, Escape, widen).
  function handleClose() {
    document.documentElement.style.overflow = '';
    setOpen(false);
    if (restoreFocus.current) {
      menuButtonRef.current?.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  // Keep Tab / Shift+Tab inside the panel (a native modal dialog otherwise
  // lets focus leave for the browser's own UI).
  function trapFocus(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return;
    const focusable = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Close (focus to the body) if the window widens to the desktop header, and
  // never leave the scroll lock behind on unmount.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const onChange = () => {
      const dialog = dialogRef.current;
      if (desktop.matches && dialog?.open) {
        restoreFocus.current = false;
        dialog.close();
      }
    };
    desktop.addEventListener('change', onChange);
    return () => {
      desktop.removeEventListener('change', onChange);
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <header className={className}>
      {/* Desktop */}
      <div className="hidden items-end lg:flex">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <HomeLink href={homeHref} layout="horizontal" />
          <BrandRail barWidth="w-16" />
        </div>
        <RailNav entries={entries} pathname={pathname ?? current} className="shrink-0" />
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-end justify-between gap-4">
          <HomeLink href={homeHref} layout="short-tail" />
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label="Menu"
            onClick={openMenu}
            className={ICON_BUTTON}
          >
            <span className="block size-4 bg-current mask-[url(/redesign/icons/menu.svg)] mask-contain mask-center mask-no-repeat" />
          </button>
        </div>
        <BrandRail barWidth="w-8" />

        <dialog
          ref={dialogRef}
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClose={handleClose}
          onKeyDown={trapFocus}
          className="bg-surface-paper text-surface-ink m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 p-0 backdrop:bg-transparent motion-safe:transition-opacity motion-safe:duration-200 motion-safe:starting:open:opacity-0"
        >
          <MobileMenuPanel
            entries={entries}
            active={active}
            homeHref={homeHref}
            tagline={tagline}
            stats={stats}
            onNavigate={() => closeMenu()}
            closeButton={
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={() => closeMenu()}
                className={ICON_BUTTON}
              >
                <CloseIcon />
              </button>
            }
          />
        </dialog>
      </div>
    </header>
  );
}

export default RailHeader;
