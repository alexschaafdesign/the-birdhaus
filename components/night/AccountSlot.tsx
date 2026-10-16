'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// The 2027 pages' account slot, in the page footer (the old Header, which
// carries Log in and the account menu, hides on 2027 pages). Signed out:
// "Log in". Signed in: an ADMIN marker for crew/staff, then Dashboard (or
// Account) · Log out. Fetched client-side from /api/account/me, the same as
// the old Header; renders nothing while loading so it doesn't flash.

type Me = { firstName: string; canAdmin: boolean };

const LINK =
  'hover:text-accent-red underline-offset-4 hover:underline focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';

export function AccountSlot() {
  const pathname = usePathname();
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
  }, [pathname]);

  async function logOut() {
    await fetch('/api/account/logout', { method: 'POST' }).catch(() => {});
    setMe(null);
    router.refresh();
  }

  if (me === undefined) return null;

  return (
    <nav
      aria-label="Account"
      className="text-ui-nav-item-14 flex flex-wrap items-center gap-x-3 gap-y-1 leading-[1.3] tracking-[--spacing(0.25)]"
    >
      {me === null ? (
        <Link href="/login" className={LINK}>
          LOG IN
        </Link>
      ) : (
        <>
          {me.canAdmin && (
            <span className="bg-accent-red text-surface-paper text-data-overline-11 px-1.5 py-0.5 font-bold tracking-[--spacing(0.625)]">
              ADMIN
            </span>
          )}
          <Link href={me.canAdmin ? '/admin' : '/account'} className={LINK}>
            {me.canAdmin ? 'DASHBOARD' : 'ACCOUNT'}
          </Link>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={logOut} className={`${LINK} cursor-pointer`}>
            LOG OUT
          </button>
        </>
      )}
    </nav>
  );
}

export default AccountSlot;
