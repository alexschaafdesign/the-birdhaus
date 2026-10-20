'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SiteFrame } from '@/components/night/SiteFrame';
import { ButtonArrow, buttonClassName } from '@/components/ui/Button';
import { FORM } from '@/components/night/form';

// A render error anywhere under the root layout (2027 frame). A client
// component, so the frame renders client-side here: its STAGING footer mark
// reads server env and doesn't show on this page.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <SiteFrame stats={null}>
      <section className="flex max-w-2xl flex-col gap-4 py-6">
        <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
          Something broke
        </p>
        <h1 className="text-header-1 leading-none font-bold uppercase">This page hit a snag</h1>
        <p className="text-body-3 leading-normal">
          Something went wrong on our end. Try again — if it keeps happening, email{' '}
          <a href="mailto:alex@thebirdhaus.org" className={FORM.link}>
            alex@thebirdhaus.org
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={reset} className={`${buttonClassName('primary', 's')} w-fit cursor-pointer`}>
            Try again
          </button>
          <Link href="/" className={`${buttonClassName('secondary', 's')} w-fit`}>
            Home
            <ButtonArrow size="s" />
          </Link>
        </div>
      </section>
    </SiteFrame>
  );
}
