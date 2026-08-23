import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="vhs-stripes h-1.5 w-24 mx-auto mb-3" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-widest text-vhs-red mb-3">404</p>
        <h1 className="text-3xl font-bold mb-4 uppercase tracking-tight">Nothing here</h1>
        <p className="text-ink/70 mb-8">
          This page flew the coop. The show, band, or link you&rsquo;re after may have moved or never existed.
        </p>
        <Link
          href="/"
          className="inline-block border-2 border-ink px-6 py-2 text-sm font-medium hover:bg-ink hover:text-paper transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
