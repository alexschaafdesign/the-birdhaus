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
      className="group relative flex flex-col overflow-hidden rounded-lg border border-dotted border-green-500/40 bg-[#E8E0D0]/5 transition-colors hover:border-green-400"
    >
      <div className="relative flex aspect-[4/5] w-full items-center justify-center bg-[#E8E0D0]/5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black leading-none text-[#E8E0D0]/70">
            {day} {month}
          </span>
          <span className="font-mono text-sm uppercase tracking-widest text-[#E8E0D0]/50">
            - {weekday}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-green-500/80">Available</p>
        <span className="flex-shrink-0 text-xs text-[#E8E0D0]/50 transition-colors group-hover:text-[#E8E0D0]">
          + Add show
        </span>
      </div>
    </Link>
  );
}
