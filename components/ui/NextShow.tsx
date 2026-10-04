import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ButtonArrow, buttonClassName } from './Button';

// Birdhaus DS primitive — Content / Next Show (Figma 224:10635). The hero for the
// next booked night. Chassis rule, top to bottom: marks → date/ID → lineup →
// data band → action → marks. Acts are listed headliner-first, as passed.
//
// Type follows the Figma text styles: date Data/Timecode 15, ID Data/Catalogue
// ID 16, set time Data/Set Time 20, band Display/2 (lh 0.9), data band Body/3 +
// Data/Spec 12. Set times / ID are accent-red, band names text-primary. Below
// sm the band names step down to Header/1 so long names don't split mid-word.
// Corner marks are 26×26 L's (size-6.5, 2px arms = 0.5) — the Chassis
// component — rotated per corner. The content overlaps the marks by 16 (-my-4),
// as in Figma. No hex or px literals here.

export type NextShowAct = { name: string; time?: string | null };

export type NextShowProps = Omit<ComponentProps<'article'>, 'children'> & {
  /** Display date, e.g. "FRI 04 SEP 2026". */
  date: string;
  /** ISO date for the <time> element. */
  dateTime?: string;
  catalogueId: string;
  acts: NextShowAct[];
  /** First data-band line, e.g. "DOORS 19:00 · ENTRY BY DONATION · ALL AGES". */
  details?: string;
  /** Spec line, e.g. "RECORDED LIVE — 18CH / 24-BIT / 48 kHz". */
  spec?: string;
  action?: { href: string; label: string };
};

// Literal rotations so Tailwind's scanner generates each utility.
const CORNERS = {
  tl: '',
  tr: 'rotate-90',
  bl: '-rotate-90',
  br: 'rotate-180',
} as const;

function Mark({ corner }: { corner: keyof typeof CORNERS }) {
  return (
    <span aria-hidden className={`relative block size-6.5 shrink-0 ${CORNERS[corner]}`}>
      <span className="bg-surface-ink absolute top-0 left-0 h-0.5 w-full" />
      <span className="bg-surface-ink absolute top-0 left-0 h-full w-0.5" />
    </span>
  );
}

export function NextShow({
  date,
  dateTime,
  catalogueId,
  acts,
  details,
  spec,
  action,
  className = '',
  ...props
}: NextShowProps) {
  return (
    <article {...props} className={`flex w-full flex-col ${className}`}>
      <div className="flex justify-between">
        <Mark corner="tl" />
        <Mark corner="tr" />
      </div>

      <div className="relative -my-4 flex flex-col gap-6 px-3 pb-6">
        <div className="flex items-center justify-between gap-4 leading-[1.2] tracking-[--spacing(0.125)]">
          <time dateTime={dateTime} className="text-timecode text-text-primary">
            {date}
          </time>
          <span className="text-data-catalogue-id-16 text-accent-red font-bold">{catalogueId}</span>
        </div>

        <ol className="flex flex-col gap-4">
          {acts.map((act, i) => (
            <li key={`${act.name}-${i}`} className="flex flex-col gap-1">
              {act.time && (
                <span className="text-data-set-time-20 text-accent-red leading-[1.2]">
                  {act.time}
                </span>
              )}
              <span className="text-header-1 sm:text-display-2 text-text-primary leading-[0.9] break-words uppercase">
                {act.name}
              </span>
            </li>
          ))}
        </ol>

        {(details || spec) && (
          <div className="text-surface-ink flex flex-col">
            {details && <p className="text-body-3 leading-normal">{details}</p>}
            {spec && (
              <p className="text-data-spec-12 leading-[1.45] tracking-[--spacing(0.25)]">{spec}</p>
            )}
          </div>
        )}

        {action && (
          <Link href={action.href} className={`${buttonClassName()} w-40 self-start`}>
            {action.label}
            <ButtonArrow />
          </Link>
        )}
      </div>

      <div className="flex justify-between">
        <Mark corner="bl" />
        <Mark corner="br" />
      </div>
    </article>
  );
}

export default NextShow;
