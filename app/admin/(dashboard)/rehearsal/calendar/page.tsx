import Link from 'next/link';
import { sql } from '@/lib/db';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { addDays, chicagoDate, startOfChicagoDay, weekdayOf } from '@/lib/rehearsal/availability';
import { getBusyTimes } from '@/lib/rehearsal/busy';
import { listBlackouts } from '@/lib/rehearsal/blackouts';
import { bookingsBetween, displayStatus } from '@/lib/rehearsal/decisions';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { timeRange, shortDay } from '@/lib/rehearsal/format';
import BlackoutPanel from '@/components/admin/rehearsal/BlackoutPanel';

export const dynamic = 'force-dynamic';

const WEEKS = 9;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function mondayOf(date: string) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

function clip(a: { start: Date; end: Date }, from: Date, to: Date) {
  const start = a.start > from ? a.start : from;
  const end = a.end < to ? a.end : to;
  return end > start ? { start, end } : null;
}

export default async function RehearsalCalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const now = new Date();
  const q = (await searchParams).from;
  const first = mondayOf(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : chicagoDate(now));
  const last = addDays(first, WEEKS * 7 - 1);
  const spanStart = startOfChicagoDay(first);
  const spanEnd = startOfChicagoDay(addDays(last, 1));

  const settings = await getRehearsalSettings();
  const [{ availability }, shows, away, blackouts, busy, bookings] = await Promise.all([
    loadAvailability({ fromDate: first, now }),
    sql<{ date: string; title: string }[]>`
      select date::text as date, title from shows
      where status not in ('cancelled', 'postponed') and date between ${first}::date and ${last}::date
    `,
    sql<{ date: string; title: string }[]>`
      select date::text as date, title from booking_days
      where unavailable and date between ${first}::date and ${last}::date
    `,
    listBlackouts(spanStart, spanEnd),
    getBusyTimes(settings.icsFeedUrls, spanStart, spanEnd, { now }),
    bookingsBetween(spanStart, spanEnd),
  ]);

  const openByDay = new Map<string, number>();
  for (const b of availability.blocks) if (b.state === 'open') openByDay.set(b.date, (openByDay.get(b.date) ?? 0) + 1);
  const today = chicagoDate(now);

  const days = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = addDays(first, i);
    const from = startOfChicagoDay(d);
    const to = startOfChicagoDay(addDays(d, 1));
    return {
      date: d,
      shows: shows.filter((s) => s.date === d).map((s) => s.title),
      away: away.find((a) => a.date === d)?.title,
      blackouts: blackouts
        .map((b) => ({ b, c: clip(b, from, to) }))
        .filter((x) => x.c)
        .map(({ b, c }) => ({
          note: b.note,
          label: c!.start.getTime() === from.getTime() && c!.end.getTime() === to.getTime() ? 'all day' : timeRange(c!.start, c!.end),
        })),
      busy: busy.busy.intervals
        .map((iv) => clip(iv, from, to))
        .filter((c): c is { start: Date; end: Date } => Boolean(c))
        .map((c) => (c.start.getTime() === from.getTime() && c.end.getTime() === to.getTime() ? 'all day' : timeRange(c.start, c.end))),
      bookings: bookings.filter((b) => chicagoDate(b.startsAt) === d),
      open: openByDay.get(d) ?? 0,
    };
  });

  const nav = 'text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline';
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">
          Rehearsal calendar <span className="text-[#E8E0D0]/50 text-base">{shortDay(spanStart)} – {shortDay(new Date(spanEnd.getTime() - 1))}</span>
        </h2>
        <div className="flex gap-4">
          <Link href={`?from=${addDays(first, -28)}`} className={nav}>← 4 weeks</Link>
          <Link href="?" className={nav}>This week</Link>
          <Link href={`?from=${addDays(first, 28)}`} className={nav}>4 weeks →</Link>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#E8E0D0]/70">
        <li><span className="mr-1.5 inline-block size-3 bg-red-500/30 align-middle" />Show day</li>
        <li><span className="mr-1.5 inline-block size-3 bg-[#E8E0D0]/15 align-middle" />Not available (Booking)</li>
        <li><span className="mr-1.5 inline-block size-3 border border-[#E8E0D0]/60 bg-black/60 align-middle" />Blackout</li>
        <li><span className="text-amber-200">busy</span> = your calendar (times only)</li>
        <li><span className="text-emerald-300">confirmed</span> · <span className="text-amber-200">requested</span> · <span className="text-red-300">⚠ conflict</span></li>
      </ul>
      {!busy.busy.checked && (
        <p className="rounded border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
          Couldn&apos;t read a calendar feed — busy times may be missing.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[56rem] grid-cols-7 border-l border-t border-[#E8E0D0]/15 text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="border-b border-r border-[#E8E0D0]/15 px-2 py-1 font-semibold uppercase tracking-wide text-[#E8E0D0]/60">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const tint = d.shows.length ? 'bg-red-500/15' : d.away ? 'bg-[#E8E0D0]/[0.07]' : d.blackouts.some((b) => b.label === 'all day') ? 'bg-black/50' : '';
            return (
              <div
                key={d.date}
                className={`min-h-28 space-y-1 border-b border-r border-[#E8E0D0]/15 p-1.5 ${tint} ${d.date < today ? 'opacity-50' : ''}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`font-semibold ${d.date === today ? 'rounded bg-[#E8E0D0] px-1 text-[#171412]' : ''}`}>
                    {Number(d.date.slice(8))}
                    {d.date.slice(8) === '01' || d.date === first
                      ? ` ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`
                      : ''}
                  </span>
                  {d.open > 0 && <span className="text-[#E8E0D0]/40">{d.open} open</span>}
                </div>
                {d.shows.map((t) => (
                  <p key={t} className="truncate text-red-200" title={t}>Show: {t}</p>
                ))}
                {d.away !== undefined && <p className="truncate text-[#E8E0D0]/60">Not available{d.away ? `: ${d.away}` : ''}</p>}
                {d.blackouts.map((b, i) => (
                  <p key={i} className="truncate text-[#E8E0D0]/80" title={b.note}>
                    ■ {b.label}{b.note ? ` · ${b.note}` : ''}
                  </p>
                ))}
                {d.busy.map((t, i) => (
                  <p key={i} className="text-amber-200/80">busy {t}</p>
                ))}
                {d.bookings.map((b) => {
                  const status = displayStatus(b, now);
                  return (
                    <Link
                      key={b.id}
                      href={`/admin/rehearsal/bands/${b.bandId}`}
                      title={`${b.catalogueId} · ${[b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — ') || 'no gear'}`}
                      className={`block truncate rounded border px-1 py-0.5 hover:underline ${
                        b.conflict
                          ? 'border-red-400 text-red-200'
                          : status === 'confirmed'
                            ? 'border-emerald-400/50 text-emerald-200'
                            : 'border-dashed border-amber-300/60 text-amber-200'
                      }`}
                    >
                      {b.conflict ? '⚠ ' : ''}
                      {timeRange(b.startsAt, b.endsAt)} {b.bandName}
                      {b.gearNeeded.length > 0 && (
                        <span className="block truncate text-[10px] opacity-70">{b.gearNeeded.join(', ')}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <BlackoutPanel
        blackouts={blackouts.map((b) => ({
          id: b.id,
          label: `${shortDay(b.start)} ${timeRange(b.start, b.end)}${
            chicagoDate(b.start) !== chicagoDate(new Date(b.end.getTime() - 1)) ? ` → ${shortDay(new Date(b.end.getTime() - 1))}` : ''
          }`,
          note: b.note,
        }))}
      />
    </main>
  );
}
