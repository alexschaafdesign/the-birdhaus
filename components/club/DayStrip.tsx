// The event page's day tracker while a multi-day song-a-day runs: one cell
// per day — gold-filled with its song count once it's passed, today enlarged
// with a pulsing ring, future days dim outlines. Server-rendered; the pulse
// is pure CSS. Dates are YYYY-MM-DD strings in the event's (Central) frame.
export default function DayStrip({
  start,
  end,
  today,
  counts,
}: {
  start: string;
  end: string;
  today: string;
  counts: Record<string, number>;
}) {
  const days: string[] = [];
  for (
    let t = Date.parse(start + 'T00:00:00Z');
    t <= Date.parse(end + 'T00:00:00Z');
    t += 86400000
  ) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const dayIndex = days.indexOf(today) + 1;
  const totalSongs = days.reduce((sum, d) => sum + (counts[d] ?? 0), 0);

  const prettyDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide">
        <span className="text-[#c8a26a]">
          Day {dayIndex} of {days.length}
        </span>
        <span className="normal-case tracking-normal text-[#E8E0D0]/45">
          · {totalSongs} {totalSongs === 1 ? 'song' : 'songs'} so far
        </span>
      </div>
      <ol className="flex flex-wrap gap-1.5">
        {days.map((d, i) => {
          const n = counts[d] ?? 0;
          const isToday = d === today;
          const isPast = d < today;
          return (
            <li
              key={d}
              title={`${prettyDate(d)} · ${n} ${n === 1 ? 'song' : 'songs'}`}
              className={`relative flex h-12 w-10 flex-col items-center justify-center rounded-lg border ${
                isToday
                  ? 'scale-110 border-[#c8a26a] bg-[#c8a26a]/25'
                  : isPast
                    ? 'border-[#c8a26a]/40 bg-[#c8a26a]/[0.12]'
                    : 'border-[#E8E0D0]/15 bg-transparent'
              }`}
            >
              {isToday && (
                <span
                  aria-hidden
                  className="absolute -inset-px animate-pulse rounded-lg border-2 border-[#c8a26a]"
                />
              )}
              <span
                className={`text-sm font-semibold leading-none ${
                  isToday
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
