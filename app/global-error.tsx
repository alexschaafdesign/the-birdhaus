'use client';

import './globals.css';

// Last resort: an error in the root layout itself (app/error.tsx renders
// inside that layout, so it can't catch these). Replaces the whole document,
// so it brings its own <html> and stays minimal: paper, ink, one message, a
// retry. Without the root layout's fonts it falls back to the system mono.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-surface-paper text-surface-ink min-h-screen font-mono">
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-8">
          <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
            The Birdhaus
          </p>
          <h1 className="text-header-2 leading-none font-bold uppercase">Something broke</h1>
          <p className="text-body-3 leading-normal">
            The site hit an error loading. Try again — if it keeps happening, email alex@thebirdhaus.org.
          </p>
          <button
            type="button"
            onClick={reset}
            className="bg-surface-ink text-surface-paper text-body-3 w-fit cursor-pointer px-4.5 py-2 font-bold"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
