'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Birdhaus DS — Rail Nav Item (Figma 229:56) and the rail nav built from it.
// Each item owns its stretch of the header rail: a space-8 ink lead-in, then a
// segment exactly the width of its label. Items sit edge to edge (no gap,
// bottom-aligned), so together with the brand rail they form one unbroken
// rail. The label sits space-3 above the rail (pt-1 is the Nav Link's own top
// inset). Rail thickness is --rail-h (set once on the header's container, so
// whatever hangs from the rail can use the same value); falls back to 4px.
//   Default  ink segment
//   Hover / focus-visible  accent-red segment at 45%
//   Active   accent-red label + segment, aria-current="page"
// No separate underline. Keyboard focus also gets the DS accent-red outline.
// Colours/type are tokens; widths are the spacing scale. No hex or px here.

export type RailNavEntry = {
  label: string;
  href: string;
  /** Route prefixes that make this item active ('/shows' matches /shows/x). */
  match: string[];
  /** Leaves the site (shows ↗ in the mobile menu). */
  external?: boolean;
};

// The active item for a path: the first whose prefix matches exactly or at a
// segment boundary. Paths no item claims get no active item.
export function activeRailItem(entries: RailNavEntry[], pathname: string): number {
  return entries.findIndex((e) =>
    e.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))
  );
}

const RAIL = 'h-(--rail-h,--spacing(1))';

export type RailNavItemProps = {
  label: string;
  href: string;
  active?: boolean;
};

export function RailNavItem({ label, href, active = false }: RailNavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="group focus-visible:outline-accent-red flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span
        className={
          'text-ui-nav-item-14 pt-1 pl-8 leading-[1.3] tracking-[--spacing(0.25)] whitespace-nowrap motion-safe:transition-colors ' +
          (active ? 'text-accent-red' : 'text-surface-ink')
        }
      >
        {label}
      </span>
      <span className="flex" aria-hidden="true">
        <span className={`bg-surface-ink w-8 shrink-0 ${RAIL}`} />
        <span
          className={
            `flex-1 ${RAIL} motion-safe:transition-colors ` +
            (active
              ? 'bg-accent-red'
              : 'bg-surface-ink group-hover:bg-accent-red/45 group-focus-visible:bg-accent-red/45')
          }
        />
      </span>
    </Link>
  );
}

export type RailNavProps = {
  entries: RailNavEntry[];
  /** Overrides the current route (component gallery / specimens). */
  pathname?: string;
  className?: string;
};

export function RailNav({ entries, pathname, className = '' }: RailNavProps) {
  const current = usePathname();
  const active = activeRailItem(entries, pathname ?? current);
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-end">
        {entries.map((e, i) => (
          <li key={e.label}>
            <RailNavItem label={e.label} href={e.href} active={i === active} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default RailNav;
