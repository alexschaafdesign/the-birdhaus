import Link from 'next/link';

export default function AdminEditFAB({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-yellow-500 px-5 py-3 text-sm font-bold text-black shadow-lg transition-transform hover:scale-105"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      {label}
    </Link>
  );
}
