'use client';

import { useEffect } from 'react';

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
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="vhs-stripes h-1.5 w-24 mx-auto mb-3" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-widest text-vhs-red mb-3">Something broke</p>
        <h1 className="text-3xl font-bold mb-4 uppercase tracking-tight">This page hit a snag</h1>
        <p className="text-ink/70 mb-8">
          Something went wrong on our end. Try again — if it keeps happening, email{' '}
          <a href="mailto:alex@thebirdhaus.org" className="underline hover:text-vhs-red">
            alex@thebirdhaus.org
          </a>
          .
        </p>
        <button
          onClick={reset}
          className="inline-block border-2 border-ink px-6 py-2 text-sm font-medium hover:bg-ink hover:text-paper transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
