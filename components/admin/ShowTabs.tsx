'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { showTabHref, type ShowTabKey } from '@/lib/show-health';

// The tabs are a small rail: accent-red on the active tab, as the public RailNav.
const CLS = {
  nav: 'flex gap-5 overflow-x-auto text-body-3 border-b-2 border-surface-ink',
  active: 'pb-2 -mb-0.5 border-b-4 border-accent-red text-accent-red font-bold flex shrink-0 items-center',
  idle: 'pb-2 -mb-0.5 border-b-4 border-transparent hover:text-accent-red flex shrink-0 items-center',
};

// Tab nav for the per-show workspace, grouped by job:
//   Overview    — the essentials: checklist, basics, bands, schedule, notes
//   Crew        — sound, door, photographer
//   Advance     — the Portal as bands see it, and their input lists
//   Public page — what the public sees: description, tickets, media
//   RSVPs       — the RSVP / door list
//   Settlement  — after
// Each tab gets an amber dot while it has an open to-do (lib/show-health — the
// same issues as the shows list and the Overview checklist).
const TABS: Array<{ key: ShowTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'lineup', label: 'Crew' },
  { key: 'advance', label: 'Advance' },
  { key: 'public', label: 'Public page' },
  { key: 'door', label: 'RSVPs' },
  { key: 'settlement', label: 'Settlement' },
];

export default function ShowTabs({
  id,
  todos = {},
}: {
  id: number;
  todos?: Partial<Record<ShowTabKey, number>>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Show sections" className={CLS.nav}>
      {TABS.map(({ key, label }) => {
        const href = showTabHref(id, key);
        // Overview is the base route, so only an exact match; the rest match by prefix.
        const active = key === 'overview' ? pathname === href : pathname.startsWith(href);
        const count = todos[key] ?? 0;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={active ? CLS.active : CLS.idle}
          >
            {label}
            {count > 0 && (
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 bg-spectrum-amber"
                title={`${count} to do`}
                aria-label={`${count} to do`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
