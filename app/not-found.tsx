import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-widest text-[#E8E0D0]/50 mb-3">404</p>
        <h1 className="text-3xl font-bold mb-4">Nothing here</h1>
        <p className="text-[#E8E0D0]/70 mb-8">
          This page flew the coop. The show, band, or link you&rsquo;re after may have moved or never existed.
        </p>
        <Link
          href="/"
          className="inline-block border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
