'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminBanner({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (!isAdmin || pathname.startsWith('/admin')) return null;

  return (
    <div className="sticky top-0 z-50 bg-yellow-500 px-4 py-1.5 text-center text-xs font-bold uppercase tracking-widest text-black">
      Admin view — showing drafts &amp; available dates ·{' '}
      <Link href="/admin" className="underline">
        Dashboard
      </Link>
    </div>
  );
}
