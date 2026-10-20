'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BirdhausWordmark } from '@/components/ui/BirdhausWordmark';

// The slim bar above every /admin page (2027 wordmark on ink), in place of the
// old public header. The admin screens under it keep their own styling for
// launch. Left: the wordmark and ADMIN, back to the dashboard. Right: back to
// the public site, then who's signed in, Account and Log out — the admin had
// no log-out control before this.
type Me = { firstName: string };

const LINK =
  'ui-hover:text-accent-brick focus-visible:outline-accent-brick underline-offset-4 ui-hover:underline focus-visible:outline-2 focus-visible:outline-offset-2';

export function AdminBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { member: null }))
      .then((data) => {
        if (!cancelled) setMe(data?.member ?? null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logOut() {
    // Clears both session cookies (account and admin).
    await fetch('/api/account/logout', { method: 'POST' }).catch(() => {});
    router.push('/');
    router.refresh();
  }

  return (
    <div className="bg-surface-ink text-surface-paper font-commit-mono">
      <div className="mx-auto flex min-h-12 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2">
        <Link href="/admin" aria-label="Birdhaus admin dashboard" className="flex items-center gap-3">
          <BirdhausWordmark layout="short-tail" className="text-surface-paper w-28" />
          <span className="bg-accent-red text-surface-paper text-data-overline-11 px-1.5 py-0.5 font-bold tracking-[--spacing(0.625)]">
            ADMIN
          </span>
        </Link>
        <nav
          aria-label="Admin account"
          className="text-ui-nav-item-14 flex flex-wrap items-center gap-x-3 gap-y-1 leading-[1.3] tracking-[--spacing(0.25)] uppercase"
        >
          <Link href="/" className={LINK}>
            ← Site
          </Link>
          {me && (
            <>
              <span aria-hidden="true" className="opacity-40">
                |
              </span>
              <span className="opacity-70 normal-case">{me.firstName}</span>
              <Link href="/account" className={LINK}>
                Account
              </Link>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={logOut} className={`${LINK} cursor-pointer uppercase`}>
                Log out
              </button>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}
