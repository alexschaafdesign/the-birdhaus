'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/shows', label: 'Shows' },
  { href: '/admin/bands', label: 'Bands' },
  { href: '/admin/settlements', label: 'Settlements' },
  { href: '/admin/submissions', label: 'Submissions' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm uppercase tracking-wide mt-2">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
