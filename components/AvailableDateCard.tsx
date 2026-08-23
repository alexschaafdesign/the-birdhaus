import Link from 'next/link';

function formatCardDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    day: date.getDate(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

export default function AvailableDateCard({ date }: { date: string }) {
  const { day, weekday, month } = formatCardDate(date);

  return (
    <Link
      href={`/admin/shows/new?date=${date}`}
      className="group relative flex flex-col overflow-hidden border-2 border-dotted border-vhs-green/50 bg-paper transition-colors hover:border-vhs-green"
    >
      <div className="relative flex aspect-square w-full items-center justify-center bg-ink/5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black leading-none text-ink/70">
            {day} {month}
          </span>
          <span className="font-mono text-sm uppercase tracking-widest text-ink/50">
            - {weekday}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-vhs-green">Available</p>
        <span className="flex-shrink-0 font-mono text-xs uppercase tracking-wider text-ink/50 transition-colors group-hover:text-ink">
          + Add show
        </span>
      </div>
    </Link>
  );
}
