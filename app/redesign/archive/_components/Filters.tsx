import { Button } from '@/components/ui/Button';
import { SeriesTick } from '@/components/ui/SeriesTick';
import type { SeriesFilter } from '@/lib/archive';

// Year + series filters for the ledger. Plain GET forms whose submit buttons
// are DS Buttons — no client JS; the page filters from searchParams. Each form
// carries the other filter (and ?sample) as hidden fields so choosing one
// keeps the rest. An empty value means "all".

const SERIES: Array<{ value: SeriesFilter; label: string; tick: 'bh' | 'fc' | 'song-club' }> = [
  { value: 'bh', label: 'BH', tick: 'bh' },
  { value: 'fc', label: 'FC', tick: 'fc' },
  { value: 'sad', label: 'SAD', tick: 'song-club' },
];

function Option({
  name,
  value,
  active,
  children,
}: {
  name: string;
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      size="s"
      arrow={false}
      variant={active ? 'primary' : 'secondary'}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}

function Keep({ fields }: { fields: Record<string, string | null> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) =>
        value === null ? null : <input key={name} type="hidden" name={name} value={value} />
      )}
    </>
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
  const sampleField = sample ? '' : null;
  return (
    <div className="flex flex-col gap-3 md:flex-row md:gap-8">
      <form method="get" aria-label="Filter by year" className="flex flex-wrap gap-2">
        <Keep fields={{ series, sample: sampleField }} />
        <Option name="year" value="" active={year === null}>
          ALL YEARS
        </Option>
        {years.map((y) => (
          <Option key={y} name="year" value={y} active={year === y}>
            {y}
          </Option>
        ))}
      </form>
      <form method="get" aria-label="Filter by series" className="flex flex-wrap gap-2">
        <Keep fields={{ year, sample: sampleField }} />
        <Option name="series" value="" active={series === null}>
          ALL SERIES
        </Option>
        {SERIES.map((s) => (
          <Option key={s.value} name="series" value={s.value} active={series === s.value}>
            <SeriesTick series={s.tick} />
            {s.label}
          </Option>
        ))}
      </form>
    </div>
  );
}
