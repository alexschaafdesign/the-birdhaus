import Link from 'next/link';
import { sql } from '@/lib/db';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { addDays, chicagoDate, startOfChicagoDay, weekdayOf } from '@/lib/rehearsal/availability';
import { listBlackouts } from '@/lib/rehearsal/blackouts';
import { bookingsBetween, displayStatus } from '@/lib/rehearsal/decisions';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { listBands } from '@/lib/rehearsal/bands';
import { sessionLabel, timeRange } from '@/lib/rehearsal/format';
import CalendarDayDrawer, { type DrawerDay } from '@/components/admin/rehearsal/CalendarDayDrawer';
import { ADMIN_TYPE, PageHeader } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sundayOf(date: string) {
  return addDays(date, -weekdayOf(date));
}

// "YYYY-MM" shifted by n months.
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function monthName(month: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

function clip(a: { start: Date; end: Date }, from: Date, to: Date) {
  const start = a.start > from ? a.start : from;
  const end = a.end < to ? a.end : to;
  return end > start ? { start, end } : null;
}

function lengthLabel(start: Date, end: Date): string {
  const h = (end.getTime() - start.getTime()) / 3_600_000;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export default async function RehearsalCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const now = new Date();
  const sp = await searchParams;
  const thisMonth = chicagoDate(now).slice(0, 7);
  const q = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  const month = q ?? thisMonth;
  const openDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  // Whole weeks, Sunday to Saturday, covering the month; the spill-over days
  // from the months either side are shown faded.
  const monthEnd = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const first = sundayOf(`${month}-01`);
  const last = addDays(sundayOf(monthEnd), 6);
  const dayCount = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
  const spanStart = startOfChicagoDay(first);
  const spanEnd = startOfChicagoDay(addDays(last, 1));

  const settings = await getRehearsalSettings();
  const [{ availability }, shows, blackouts, bookings, bands] = await Promise.all([
    loadAvailability({ fromDate: first, now }),
    sql<{ date: string; title: string }[]>`
      select date::text as date, title from shows
      where status not in ('cancelled', 'postponed') and date between ${first}::date and ${last}::date
    `,
    listBlackouts(spanStart, spanEnd),
    bookingsBetween(spanStart, spanEnd),
    listBands(),
  ]);

  // Open stretches per day, as bands see them (slivers shorter than the
  // shortest length left out).
  const minMs = Math.min(...settings.allowedLengths) * 60_000;
  const openByDay = new Map<string, string[]>();
  for (const d of availability.days) {
    openByDay.set(
      d.date,
      d.free.filter((f) => f.end.getTime() - f.start.getTime() >= minMs).map((f) => timeRange(f.start, f.end)),
    );
  }
  const today = chicagoDate(now);

  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = addDays(first, i);
    const from = startOfChicagoDay(d);
    const to = startOfChicagoDay(addDays(d, 1));
    return {
      date: d,
      shows: shows.filter((s) => s.date === d).map((s) => s.title),
      blackouts: blackouts
        .map((b) => ({ b, c: clip(b, from, to) }))
        .filter((x) => x.c)
        .map(({ b, c }) => ({
          id: b.id,
          multiDay: b.start < from || b.end > to,
          note: b.note,
          label: c!.start.getTime() === from.getTime() && c!.end.getTime() === to.getTime() ? 'all day' : timeRange(c!.start, c!.end),
        })),
      bookings: bookings.filter((b) => chicagoDate(b.startsAt) === d),
      open: openByDay.get(d) ?? [],
    };
  });

  const dayHref = (d: string) => `?${new URLSearchParams({ ...(q ? { month: q } : {}), day: d }).toString()}`;
  const closeHref = q ? `?month=${q}` : '?';
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const drawer = openDay ? days.find((d) => d.date === openDay) : undefined;
  const drawerDay: DrawerDay | null = drawer
    ? {
        date: drawer.date,
        title: new Date(`${drawer.date}T12:00:00Z`).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }),
        open: drawer.open,
        shows: drawer.shows,
        blocks: drawer.blackouts.map((b) => ({ id: b.id, label: b.label, note: b.note, multiDay: b.multiDay })),
        bookings: drawer.bookings.map((b) => ({
          id: b.id,
          bandId: b.bandId,
          label: `${timeRange(b.startsAt, b.endsAt)} (${lengthLabel(b.startsAt, b.endsAt)}) ${b.bandName}`,
          status: displayStatus(b, now),
          conflict: b.conflict,
          started: b.startsAt <= now,
          cancelLabel: `${b.bandName}, ${sessionLabel(b.startsAt, b.endsAt)}`,
        })),
      }
    : null;

  const nav = `text-body-3 ${ADMIN_TYPE.link}`;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader
        overline="Rehearsal"
        title="Calendar"
        description={monthName(month, { month: 'long', year: 'numeric' })}
        actions={
          <div className="flex gap-4">
            <Link href={`?month=${prev}`} className={nav}>← {monthName(prev, { month: 'short' })}</Link>
            {month !== thisMonth && <Link href="?" className={nav}>This month</Link>}
            <Link href={`?month=${next}`} className={nav}>{monthName(next, { month: 'short' })} →</Link>
          </div>
        }
      />

      {/* Legend. Fills and edges only, ink text (DESIGN.md: spectrum is fill-only on paper). */}
      <ul className="text-data-caption-13 flex flex-wrap items-center gap-x-5 gap-y-2">
        <li><span className="bg-accent-red/15 border-accent-red mr-1.5 inline-block size-3 border align-middle" />Show day</li>
        <li><span className="bg-surface-ink/15 border-surface-ink mr-1.5 inline-block size-3 border align-middle" />Block</li>
        <li><span className="border-surface-ink border px-1">confirmed</span> · <span className="border-surface-ink border border-dashed px-1">requested</span> · <span className="border-accent-red text-accent-red border-2 px-1 font-bold">⚠ conflict</span></li>
        <li className="text-surface-ink/60">
          Click a date to add a rehearsal · blocks are added on the{' '}
          <Link href={`/admin/calendar${q ? `?month=${q}` : ''}`} className={ADMIN_TYPE.link}>Calendar</Link>
        </li>
      </ul>

      <div className="overflow-x-auto">
        <div className="text-data-caption-13 grid min-w-[56rem] grid-cols-7 border-t border-l border-surface-ink">
          {WEEKDAYS.map((w) => (
            <div key={w} className={`${ADMIN_TYPE.overline} border-surface-ink border-r border-b-2 px-2 py-1`}>
              {w}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = d.date.startsWith(month);
            const past = d.date < today;
            const tint = d.shows.length ? 'bg-accent-red/15' : d.blackouts.some((b) => b.label === 'all day') ? 'bg-surface-ink/15' : '';
            return (
              <div
                key={d.date}
                className={`min-h-28 space-y-1 border-b border-r border-surface-ink p-1.5 ${tint} ${!inMonth ? 'opacity-35' : past ? 'opacity-50' : ''}`}
              >
                <Link
                  href={dayHref(d.date)}
                  scroll={false}
                  title="Open this day: block time, see what's on"
                  className={`-m-0.5 flex items-baseline justify-between gap-1 p-0.5 hover:bg-surface-paper-shade hover:text-accent-red ${ADMIN_TYPE.focus}`}
                >
                  <span className={`font-bold ${d.date === today ? 'bg-surface-ink text-surface-paper px-1' : ''}`}>
                    {Number(d.date.slice(8))}
                    {!inMonth && (d.date.slice(8) === '01' || d.date === first)
                      ? ` ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`
                      : ''}
                  </span>
                  <span className="text-surface-ink/60">+</span>
                </Link>
                {d.open.length > 0 && !past && (
                  <p className="truncate text-surface-ink/60" title={`Open ${d.open.join(', ')}`}>
                    open {d.open.join(', ')}
                  </p>
                )}
                {d.shows.map((t) => (
                  <p key={t} className="text-accent-red truncate font-bold" title={t}>Show: {t}</p>
                ))}
                {d.blackouts.map((b, i) => (
                  <p key={i} className="truncate text-surface-ink/80" title={b.note}>
                    ■ {b.label}{b.note ? ` · ${b.note}` : ''}
                  </p>
                ))}
                {d.bookings.map((b) => {
                  const status = displayStatus(b, now);
                  return (
                    <Link
                      key={b.id}
                      href={`/admin/rehearsal/bands/${b.bandId}`}
                      title={`${b.catalogueId} · ${[b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — ') || 'no gear'}`}
                      className={`bg-surface-paper block truncate px-1 py-0.5 underline-offset-2 hover:underline ${
                        b.conflict
                          ? 'border-accent-red text-accent-red border-2 font-bold'
                          : status === 'confirmed'
                            ? 'border-surface-ink border'
                            : 'border-surface-ink border border-dashed'
                      }`}
                    >
                      {b.conflict ? '⚠ ' : ''}
                      {timeRange(b.startsAt, b.endsAt)} ({lengthLabel(b.startsAt, b.endsAt)}) {b.bandName}
                      {b.gearNeeded.length > 0 && (
                        <span className="block truncate text-data-label-10-small opacity-70">{b.gearNeeded.join(', ')}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Wrapped so main's space-y margin lands on the div, not on the fixed scrim and panel. */}
      {drawerDay && (
        <div>
          <CalendarDayDrawer
            key={drawerDay.date}
            day={drawerDay}
            closeHref={closeHref}
            bands={bands.filter((b) => !b.archived).map((b) => ({ id: b.id, name: b.name }))}
            past={drawerDay.date < today}
          />
        </div>
      )}

    </main>
  );
}
