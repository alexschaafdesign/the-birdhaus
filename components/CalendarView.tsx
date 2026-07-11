import Link from 'next/link';
import type { Show } from '@/lib/shows';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function CalendarView({ shows }: { shows: Show[] }) {
  const showsByMonth = new Map<string, Show[]>();
  for (const show of shows) {
    const date = parseLocalDate(show.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const monthShows = showsByMonth.get(key) ?? [];
    monthShows.push(show);
    showsByMonth.set(key, monthShows);
  }

  const monthKeys = Array.from(showsByMonth.keys()).sort((a, b) => {
    const [aYear, aMonth] = a.split('-').map(Number);
    const [bYear, bMonth] = b.split('-').map(Number);
    return aYear - bYear || aMonth - bMonth;
  });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {monthKeys.map((key) => {
        const [year, month] = key.split('-').map(Number);
        const monthShows = showsByMonth.get(key)!;

        const showsByDay = new Map<number, Show>();
        for (const show of monthShows) {
          showsByDay.set(parseLocalDate(show.date).getDate(), show);
        }

        const firstOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: Array<number | null> = [
          ...Array.from({ length: firstOfMonth.getDay() }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];

        return (
          <div key={key} className="rounded-lg border border-[#E8E0D0]/20 p-4">
            <h3 className="mb-3 text-lg font-bold">
              {firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-[#E8E0D0]/40">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={i}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} />;

                const show = showsByDay.get(day);
                if (!show) {
                  return (
                    <div
                      key={day}
                      className="flex aspect-square items-center justify-center text-sm text-[#E8E0D0]/30"
                    >
                      {day}
                    </div>
                  );
                }

                return (
                  <Link
                    key={day}
                    href={`/shows/${show.slug}`}
                    title={show.title}
                    className="group relative aspect-square overflow-hidden rounded border border-[#E8E0D0]/30 transition-colors hover:border-yellow-400"
                  >
                    {show.flyer ? (
                      <img
                        src={show.flyer}
                        alt={`${show.title} flyer`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-[#E8E0D0]/10" />
                    )}
                    <span className="absolute left-1 top-0.5 text-[10px] font-bold text-white drop-shadow">
                      {day}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
