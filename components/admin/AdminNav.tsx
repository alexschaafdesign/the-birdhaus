'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV as GROUPS, adminLinkActive as linkActive } from './nav';

// The old dark two-row nav, still used by admin pages not yet on the 2027
// sidebar (see isMigratedAdminPath in ./nav). Deleted in the last phase.

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
