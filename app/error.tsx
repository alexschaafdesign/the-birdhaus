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
        <p className="text-xs uppercase tracking-widest text-[#E8E0D0]/50 mb-3">Something broke</p>
        <h1 className="text-3xl font-bold mb-4">This page hit a snag</h1>
        <p className="text-[#E8E0D0]/70 mb-8">
          Something went wrong on our end. Try again — if it keeps happening, email{' '}
          <a href="mailto:alex@thebirdhaus.org" className="underline hover:text-[#E8E0D0]">
            alex@thebirdhaus.org
          </a>
          .
        </p>
        <button
          onClick={reset}
          className="inline-block border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
