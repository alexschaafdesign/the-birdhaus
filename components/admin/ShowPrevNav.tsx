'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface ShowNeighbor {
  id: number;
  label: string;
}

// Prev/next navigation between shows (chronological) in the per-show workspace.
// Keeps whatever tab you're on — reads the current sub-route off the pathname and
// carries it to the neighbor, so you can flip through settlements, portals, etc.
export default function ShowPrevNav({
  currentId,
  prev,
  next,
}: {
  currentId: number;
  prev: ShowNeighbor | null;
  next: ShowNeighbor | null;
}) {
  const pathname = usePathname();
  const base = `/admin/shows/${currentId}`;
  const suffix = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const linkTo = (id: number) => `/admin/shows/${id}${suffix}`;

  const linkCls =
    'flex min-w-0 items-center gap-1.5 text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors';
  const endCls = 'flex items-center gap-1.5 text-sm text-[#E8E0D0]/25 cursor-default';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.03] px-3 py-1.5">
      {prev ? (
        <Link href={linkTo(prev.id)} className={linkCls} title={prev.label}>
          <span aria-hidden>←</span>
          <span className="truncate">{prev.label}</span>
        </Link>
      ) : (
        <span className={endCls}>
          <span aria-hidden>←</span> Earliest
        </span>
      )}
      {next ? (
        <Link href={linkTo(next.id)} className={`${linkCls} justify-end text-right`} title={next.label}>
          <span className="truncate">{next.label}</span>
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <span className={`${endCls} justify-end`}>
          Latest <span aria-hidden>→</span>
        </span>
      )}
    </div>
  );
}
