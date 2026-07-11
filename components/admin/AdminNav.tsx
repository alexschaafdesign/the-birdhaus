'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Submissions' },
  { href: '/admin/shows', label: 'Shows' },
  { href: '/admin/bands', label: 'Bands' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm uppercase tracking-wide mt-2">
      {LINKS.map(({ href, label }) => {
        // '/admin' itself must match exactly — otherwise its prefix check would
        // also match every nested admin route (e.g. '/admin/shows').
        const active =
          href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? 'text-[#E8E0D0] underline'
                : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors'
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
