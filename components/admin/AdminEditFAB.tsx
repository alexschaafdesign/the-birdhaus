import Link from 'next/link';

// Floats over public pages, which mix paper and ink sections, so it is red
// rather than ink: it has to read on both grounds.
export default function AdminEditFAB({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-accent-red text-surface-paper ui-hover:bg-surface-paper ui-hover:text-accent-red border-accent-red text-ui-button-15 fixed right-6 bottom-6 z-40 inline-flex h-13 items-center gap-2.5 border-2 px-6.5 font-bold leading-[1.2] tracking-[--spacing(0.25)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-red"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      {label}
    </Link>
  );
}
