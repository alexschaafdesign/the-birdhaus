'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Tab nav for the per-show workspace. The Portal tab opens the read-only band
// hub in a new tab (external link). Details is the base route, so it's only
// active on an exact match; the others match their path prefix.
export default function ShowTabs({
  id,
  portalUrl,
}: {
  id: number;
  portalUrl?: string | null;
}) {
  const pathname = usePathname();
  const base = `/admin/shows/${id}`;
  const tabs = [
    { href: base, label: 'Details', exact: true },
    { href: `${base}/advance`, label: 'Advance', exact: false },
    { href: `${base}/inputs`, label: 'Inputs', exact: false },
    { href: `${base}/settlement`, label: 'Settlement', exact: false },
    { href: `${base}/rsvps`, label: 'RSVPs', exact: false },
  ];

  return (
    <nav className="flex gap-5 text-sm border-b border-[#E8E0D0]/15">
      {portalUrl && (
        <a
          href={portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pb-2 -mb-px border-b-2 border-transparent text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors"
        >
          Portal ↗
        </a>
      )}
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
