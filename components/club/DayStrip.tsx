import Link from 'next/link';

// The event page's day tracker while a multi-day song-a-day runs: one cell
// per day — gold-filled with its song count once it's passed, the selected
// day enlarged, today carrying a pulsing ring. Server-rendered; the pulse is
// pure CSS. Dates are YYYY-MM-DD strings in the event's (Central) frame.
//
// When `dayHref` is passed the strip becomes a day switcher: past + today
// cells link to that day's view, `selected` marks the day being viewed
// (defaults to today), and future days stay dim and unclickable.
export default function DayStrip({
  start,
  end,
  today,
  counts,
  selected,
  dayHref,
}: {
  start: string;
  end: string;
  today: string;
  counts: Record<string, number>;
  selected?: string;
  dayHref?: (day: string, n: number) => string;
}) {
  const days: string[] = [];
  for (
    let t = Date.parse(start + 'T00:00:00Z');
    t <= Date.parse(end + 'T00:00:00Z');
    t += 86400000
  ) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const view = selected ?? today;
  const viewIndex = days.indexOf(view) + 1;
  const isTodayView = view === today;
  const totalSongs = days.reduce((sum, d) => sum + (counts[d] ?? 0), 0);

  const prettyDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide">
        <span className="text-[#c8a26a]">
          Day {viewIndex} of {days.length}
        </span>
        <span className="normal-case tracking-normal text-[#E8E0D0]/45">
          {isTodayView
            ? `· ${totalSongs} ${totalSongs === 1 ? 'song' : 'songs'} so far`
            : `· ${counts[view] ?? 0} ${(counts[view] ?? 0) === 1 ? 'song' : 'songs'}`}
        </span>
      </div>
      <ol className="flex flex-wrap gap-1.5 sm:flex-nowrap">
        {days.map((d, i) => {
          const n = counts[d] ?? 0;
          const isToday = d === today;
          const isPast = d < today;
          const isFuture = d > today;
          const isSelected = d === view;
          const clickable = Boolean(dayHref) && !isFuture;

          const cellClass = `relative flex h-12 w-10 flex-col items-center justify-center rounded-lg border transition sm:w-full ${
            isSelected
              ? 'scale-110 border-[#c8a26a] bg-[#c8a26a]/25'
              : isPast
                ? 'border-[#c8a26a]/40 bg-[#c8a26a]/[0.12]'
                : 'border-[#E8E0D0]/15 bg-transparent'
          } ${clickable && !isSelected ? 'hover:border-[#c8a26a] hover:bg-[#c8a26a]/20' : ''}`;

          const inner = (
            <>
              {isToday && (
                <span
                  aria-hidden
                  className="absolute -inset-px animate-pulse rounded-lg border-2 border-[#c8a26a]"
                />
              )}
              <span
                className={`text-sm font-semibold leading-none ${
                  isSelected
                    ? 'text-[#E8E0D0]'
                    : isPast
                      ? 'text-[#c8a26a]/90'
                      : 'text-[#E8E0D0]/35'
                }`}
              >
                {i + 1}
              </span>
              {(isPast || isToday) && (
                <span
                  className={`mt-0.5 text-[11px] leading-none ${
                    n > 0 ? 'text-[#E8E0D0]/70' : 'text-[#E8E0D0]/30'
                  }`}
                >
                  {n > 0 ? `${n} ♪` : '·'}
                </span>
              )}
            </>
          );

          return (
            <li
              key={d}
              title={`${prettyDate(d)} · ${n} ${n === 1 ? 'song' : 'songs'}`}
              className="sm:min-w-0 sm:flex-1"
            >
              {clickable ? (
                <Link
                  href={dayHref!(d, i + 1)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cellClass}
                >
                  {inner}
                </Link>
              ) : (
                <span className={cellClass}>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
