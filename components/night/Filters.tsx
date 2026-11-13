import Link from 'next/link';
import { buttonClassName } from '@/components/ui/Button';
import { SeriesTick } from '@/components/ui/SeriesTick';
import type { SeriesFilter } from '@/lib/archive';

// Year + series filters for the ledger. Links styled as DS Buttons; the page
// filters from searchParams. scroll={false} makes picking one a soft
// navigation that keeps the scroll position (without JS they're plain links).
// Each link carries the other filter (and ?sample) so choosing one keeps the
// rest. A null value means "all".

const SERIES: Array<{ value: SeriesFilter; label: string; tick: 'bh' | 'fc' }> = [
  { value: 'bh', label: 'BH', tick: 'bh' },
  { value: 'fc', label: 'FC', tick: 'fc' },
];

function filterHref(year: string | null, series: SeriesFilter | null, sample: boolean): string {
  const params = [
    year && `year=${year}`,
    series && `series=${series}`,
    sample && 'sample',
  ].filter(Boolean);
  return params.length ? `/archive?${params.join('&')}` : '/archive';
}

function Option({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={buttonClassName(active ? 'primary' : 'secondary', 's')}
    >
      {children}
    </Link>
  );
}

export function Filters({
  years,
  year,
  series,
  sample,
}: {
  years: string[];
  year: string | null;
  series: SeriesFilter | null;
  sample: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:gap-8">
      <div role="group" aria-label="Filter by year" className="flex flex-wrap gap-2">
        <Option href={filterHref(null, series, sample)} active={year === null}>
          ALL YEARS
        </Option>
        {years.map((y) => (
          <Option key={y} href={filterHref(y, series, sample)} active={year === y}>
            {y}
          </Option>
        ))}
      </div>
      <div role="group" aria-label="Filter by series" className="flex flex-wrap gap-2">
        <Option href={filterHref(year, null, sample)} active={series === null}>
          ALL SERIES
        </Option>
        {SERIES.map((s) => (
          <Option key={s.value} href={filterHref(year, s.value, sample)} active={series === s.value}>
            <SeriesTick series={s.tick} />
            {s.label}
          </Option>
        ))}
      </div>
    </div>
  );
}
