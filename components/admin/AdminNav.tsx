'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLink {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const GROUPS: NavGroup[] = [
  {
    label: 'Shows',
    links: [
      { href: '/admin/shows', label: 'Shows' },
      { href: '/admin/submissions', label: 'Submissions' },
    ],
  },
  {
    label: 'Song Club',
    links: [{ href: '/admin/song-club', label: 'Song Club' }],
  },
  {
    label: 'Bands',
    links: [{ href: '/admin/bands', label: 'Bands' }],
  },
  {
    label: 'Money',
    links: [
      { href: '/admin/settlements', label: 'Settlements' },
      { href: '/admin/expenses', label: 'Expenses' },
    ],
  },
  {
    label: 'Crew',
    links: [
      { href: '/admin/crew', label: 'Crew' },
      { href: '/admin/sound-engineers', label: 'Sound Engineers' },
      { href: '/admin/photographers', label: 'Photographers' },
      { href: '/admin/timesheet', label: 'Timesheet' },
    ],
  },
  {
    label: 'Settings',
    links: [{ href: '/admin/settings', label: 'Settings' }],
  },
];

function linkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const rowClass =
  'flex gap-4 text-sm uppercase tracking-wide overflow-x-auto whitespace-nowrap -mx-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export default function AdminNav() {
  const pathname = usePathname();

  const activeGroup = GROUPS.find((group) =>
    group.links.some((link) => linkActive(pathname, link.href)),
  );

  return (
    <div className="space-y-2 mt-2">
      <nav className={rowClass}>
        {GROUPS.map((group) => {
          const active = group === activeGroup;
          return (
            <Link
              key={group.label}
              href={group.links[0].href}
              className={
                active
                  ? 'text-[#E8E0D0] underline shrink-0'
                  : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors shrink-0'
              }
            >
              {group.label}
            </Link>
          );
        })}
      </nav>
      {activeGroup && activeGroup.links.length > 1 && (
        <nav className={`${rowClass} text-xs`}>
          {activeGroup.links.map(({ href, label }) => {
            const active = linkActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? 'text-[#E8E0D0] underline shrink-0'
                    : 'text-[#E8E0D0]/50 hover:text-[#E8E0D0] transition-colors shrink-0'
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
