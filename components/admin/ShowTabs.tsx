'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Tab nav for the per-show workspace. Details is the base route, so it's only
// active on an exact match; the others match their path prefix.
export default function ShowTabs({ id }: { id: number }) {
  const pathname = usePathname();
  const base = `/admin/shows/${id}`;
  // No Portal tab: it was just a redirect to /hub. The portal link now sits in
  // the Advance tab's header (copy/open) and the Details tab's share box; the
  // /portal route itself still works for old links.
  const tabs = [
    { href: base, label: 'Details', exact: true },
    { href: `${base}/advance`, label: 'Advance', exact: false },
    { href: `${base}/inputs`, label: 'Inputs', exact: false },
    { href: `${base}/settlement`, label: 'Settlement', exact: false },
    { href: `${base}/rsvps`, label: 'RSVPs', exact: false },
  ];

  return (
    <nav className="flex gap-5 text-sm border-b border-[#E8E0D0]/15">
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? 'pb-2 -mb-px border-b-2 border-[#E8E0D0] text-[#E8E0D0] font-medium'
                : 'pb-2 -mb-px border-b-2 border-transparent text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors'
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
