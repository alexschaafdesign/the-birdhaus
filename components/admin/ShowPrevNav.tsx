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
    'flex min-w-0 items-center gap-1 text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors';
  const endCls = 'flex items-center gap-1 text-xs text-[#E8E0D0]/25 cursor-default';
  const labelCls = 'truncate max-w-[9rem] sm:max-w-[11rem]';

  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.03] px-2.5 py-1">
      {prev ? (
        <Link href={linkTo(prev.id)} className={linkCls} title={prev.label}>
          <span aria-hidden>←</span>
          <span className={labelCls}>{prev.label}</span>
        </Link>
      ) : (
        <span className={endCls}>
          <span aria-hidden>←</span> Earliest
        </span>
      )}
      <span aria-hidden className="text-[#E8E0D0]/15">|</span>
      {next ? (
        <Link href={linkTo(next.id)} className={linkCls} title={next.label}>
          <span className={labelCls}>{next.label}</span>
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <span className={endCls}>
          Latest <span aria-hidden>→</span>
        </span>
      )}
    </div>
  );
}
