import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ButtonArrow } from './Button';
import { SeriesTick, type Series } from './SeriesTick';

// Birdhaus DS primitive — Content / Show Row (Figma 223:9522). One row of the
// upcoming/archive table: ID · date · lineup · arrow, the whole row one link.
// ID is the registry string (BH-YYMMDD, SC-###…) in Data/Caption 13 Bold,
// accent-red; date + lineup are UI/Nav Item 14. Date may be a range
// ("SEP 16 – SEP 25"). Series tick is optional and sits before the ID.
// Column widths are the Figma ones on the spacing scale (ID w-28 = 112 with a
// 10 gap to the tick, date w-40 = 160); below sm the date column hugs its text. Hover is surface-paper-shade,
// the DS "hover rows on paper" token. No hex or px literals here.

export type ShowRowProps = Omit<ComponentProps<typeof Link>, 'children'> & {
  catalogueId: string;
  date: string;
  lineup: string;
  series?: Series;
};

export function ShowRow({
  catalogueId,
  date,
  lineup,
  series,
  className = '',
  ...props
}: ShowRowProps) {
  return (
    <Link
      {...props}
      className={
        'text-text-primary ui-hover:bg-surface-paper-shade flex min-h-10 w-full items-center gap-4 py-3 transition-colors ' +
        'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
        className
      }
    >
      <span className="flex w-28 shrink-0 items-center gap-2.5">
        {series && <SeriesTick series={series} />}
        <span className="text-data-caption-13-bold text-accent-red truncate font-bold leading-[1.4] tracking-[--spacing(0.375)]">
          {catalogueId}
        </span>
      </span>
      <span className="text-ui-nav-item-14 shrink-0 leading-[1.3] tracking-[--spacing(0.25)] whitespace-nowrap sm:w-40">
        {date}
      </span>
      <span className="text-ui-nav-item-14 min-w-0 flex-1 truncate leading-[1.3] tracking-[--spacing(0.25)] uppercase">
        {lineup}
      </span>
      <ButtonArrow />
    </Link>
  );
}

export default ShowRow;
