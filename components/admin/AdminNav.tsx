'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/shows', label: 'Shows' },
  { href: '/admin/song-club', label: 'Song Club' },
  { href: '/admin/bands', label: 'Bands' },
  { href: '/admin/settlements', label: 'Settlements' },
  { href: '/admin/expenses', label: 'Expenses' },
  { href: '/admin/timesheet', label: 'Timesheet' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm uppercase tracking-wide mt-2 overflow-x-auto whitespace-nowrap -mx-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? 'text-[#E8E0D0] underline shrink-0'
                : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors shrink-0'
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
