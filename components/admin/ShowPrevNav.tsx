'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminPaper } from './AdminTheme';

// Classes per admin frame (paper on migrated tabs, the old dark shell on the rest).
const CLS = {
  paper: {
    link: 'flex min-w-0 items-center gap-1 text-data-caption-13 hover:text-accent-red',
    end: 'flex items-center gap-1 text-data-caption-13 text-surface-ink/40 cursor-default',
    box: 'inline-flex shrink-0 items-center gap-2 border border-surface-ink px-2.5 py-1',
    sep: 'text-surface-ink/30',
  },
  dark: {
    link: 'flex min-w-0 items-center gap-1 text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors',
    end: 'flex items-center gap-1 text-xs text-[#E8E0D0]/25 cursor-default',
    box: 'inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.03] px-2.5 py-1',
    sep: 'text-[#E8E0D0]/15',
  },
};

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

  const cls = CLS[useAdminPaper() ? 'paper' : 'dark'];
  const linkCls = cls.link;
  const endCls = cls.end;
  const labelCls = 'truncate max-w-[9rem] sm:max-w-[11rem]';

  return (
    <div className={cls.box}>
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
      <span aria-hidden className={cls.sep}>|</span>
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
