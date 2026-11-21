import Link from 'next/link';
import { sql } from '@/lib/db';
import { addDays, chicagoDate, startOfChicagoDay, weekdayOf } from '@/lib/rehearsal/availability';
import { listBlackouts } from '@/lib/rehearsal/blackouts';
import { bookingsBetween, displayStatus } from '@/lib/rehearsal/decisions';
import { timeRange } from '@/lib/rehearsal/format';
import { ADMIN_TYPE, PageHeader } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';
import BlockEditor from '@/components/admin/calendar/BlockEditor';

export const dynamic = 'force-dynamic';

// The master calendar: one month grid with everything that claims a day —
// shows (announced or draft), Booking's day plans and marked-available dates,
// rehearsal bookings, and blocks. Blocks (Alex's own "not available"
// time) are added and removed here and only here; everything else links to
// the page that owns it (Shows, Booking, Rehearsal calendar).
//
// Each day gets one verdict at the top so "is this date free?" has a single
// answer: Show > Draft show > Blocked (all day) > Open for a show (marked
// available) > nothing. Who a date was offered to lives in Booking's notepad.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LAYERS = ['shows', 'booking', 'rehearsal', 'blocks'] as const;
type Layer = (typeof LAYERS)[number];
const LAYER_LABELS: Record<Layer, string> = {
  shows: 'Shows',
  booking: 'Booking',
  rehearsal: 'Rehearsal',
  blocks: 'Blocks',
};

function sundayOf(date: string) {
  return addDays(date, -weekdayOf(date));
}

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

type Verdict = { kind: 'show' | 'draft' | 'blocked' | 'open'; label: string };

const VERDICT_TINT: Record<Verdict['kind'], string> = {
  show: 'bg-spectrum-violet/10',
  draft: 'bg-spectrum-violet/5',
  blocked: 'bg-surface-ink/15',
  open: '',
};

const VERDICT_MARK: Record<Verdict['kind'], string> = {
  show: 'text-spectrum-violet',
  draft: 'text-spectrum-violet/70',
  blocked: 'text-surface-ink/80',
  open: 'border border-dotted border-surface-ink px-1',
};

export default async function MasterCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; hide?: string }>;
}) {
  const now = new Date();
  const sp = await searchParams;
  const thisMonth = chicagoDate(now).slice(0, 7);
  const q = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  const month = q ?? thisMonth;
  const openDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const hidden = new Set((sp.hide ?? '').split(',').filter((l): l is Layer => (LAYERS as readonly string[]).includes(l)));
  const on = (l: Layer) => !hidden.has(l);

  const monthEnd = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const first = sundayOf(`${month}-01`);
  const last = addDays(sundayOf(monthEnd), 6);
  const dayCount = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
  const spanStart = startOfChicagoDay(first);
  const spanEnd = startOfChicagoDay(addDays(last, 1));

  const [shows, plans, available, blackouts, rehearsals] = await Promise.all([
    sql<{ id: number; date: string; title: string; announced: boolean }[]>`
      select id::int as id, date::text as date, title, announced from shows
      where status = 'scheduled' and date between ${first}::date and ${last}::date
      order by date, id
    `,
    sql<{ date: string; title: string; notepad: string }[]>`
      select date::text as date, title, notepad from booking_days
      where (title <> '' or notepad <> '') and date between ${first}::date and ${last}::date
    `,
    sql<{ date: string }[]>`
      select date::text as date from available_dates
      where date between ${first}::date and ${last}::date
    `,
    listBlackouts(spanStart, spanEnd),
    bookingsBetween(spanStart, spanEnd),
  ]);

  const today = chicagoDate(now);
  const availableSet = new Set(available.map((a) => a.date));

  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = addDays(first, i);
    const from = startOfChicagoDay(d);
    const to = startOfChicagoDay(addDays(d, 1));
    const allDay = (c: { start: Date; end: Date }) => c.start.getTime() === from.getTime() && c.end.getTime() === to.getTime();
    const dayShows = shows.filter((s) => s.date === d);
    const plan = plans.find((p) => p.date === d);
    const blocks = blackouts
      .map((b) => ({ b, c: clip(b, from, to) }))
      .filter((x) => x.c)
      .map(({ b, c }) => ({
        id: b.id,
        note: b.note,
        allDay: allDay(c!),
        multiDay: b.start < from || b.end > to,
        label: allDay(c!) ? 'all day' : timeRange(c!.start, c!.end),
      }));
    const dayRehearsals = rehearsals
      .filter((b) => chicagoDate(b.startsAt) === d)
      .map((b) => ({ ...b, shown: displayStatus(b, now) }))
      .filter((b) => b.shown !== 'expired');

    // Verdicts always consider every source, so hiding a layer never makes a
    // taken day look free.
    let verdict: Verdict | null = null;
    if (dayShows.some((s) => s.announced)) verdict = { kind: 'show', label: 'Show' };
    else if (dayShows.length) verdict = { kind: 'draft', label: 'Draft show' };
    else if (blocks.some((b) => b.allDay)) verdict = { kind: 'blocked', label: 'Blocked' };
    else if (availableSet.has(d)) verdict = { kind: 'open', label: 'Open for a show' };

    return { date: d, verdict, shows: dayShows, plan, blocks, rehearsals: dayRehearsals };
  });

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { month: q, hide: hidden.size ? [...hidden].join(',') : null, day: openDay, ...over };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '?';
  };
  const toggleHref = (l: Layer) => {
    const next = new Set(hidden);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    return qs({ hide: next.size ? [...next].join(',') : null, day: null });
  };
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const drawer = openDay ? days.find((d) => d.date === openDay) : undefined;
  const nav = `text-body-3 ${ADMIN_TYPE.link}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader
        overline="Everything"
        title="Calendar"
        actions={
          <div className="flex items-baseline gap-5">
            <Link href={qs({ month: prev, day: null })} className={nav}>← {monthName(prev, { month: 'short' })}</Link>
            <h2 className={`${ADMIN_TYPE.heading} min-w-40 text-center`}>{monthName(month, { month: 'long', year: 'numeric' })}</h2>
            <Link href={qs({ month: next, day: null })} className={nav}>{monthName(next, { month: 'short' })} →</Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className={`${ADMIN_TYPE.overline} text-surface-ink/60 mr-1`}>Show</span>
        {LAYERS.map((l) => (
          <Link
            key={l}
            href={toggleHref(l)}
            scroll={false}
            aria-pressed={on(l)}
            className={`text-data-caption-13 border border-surface-ink px-2 py-0.5 ${ADMIN_TYPE.focus} ${
              on(l) ? 'bg-surface-ink text-surface-paper' : 'text-surface-ink/60 hover:bg-surface-paper-shade'
            }`}
          >
            {LAYER_LABELS[l]}
          </Link>
        ))}
      </div>

      <ul className="text-data-caption-13 flex flex-wrap items-center gap-x-5 gap-y-2">
        <li><span className="bg-spectrum-violet/10 border-spectrum-violet mr-1.5 inline-block size-3 border align-middle" />Show</li>
        <li><span className="bg-spectrum-violet/5 border-spectrum-violet/60 mr-1.5 inline-block size-3 border border-dashed align-middle" />Draft show</li>
        <li><span className="bg-surface-ink/15 border-surface-ink mr-1.5 inline-block size-3 border align-middle" />Blocked all day</li>
        <li><span className="border-surface-ink border border-dotted px-1">Open for a show</span> = marked available in Booking</li>
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
            return (
              <Link
                key={d.date}
                href={qs({ day: d.date })}
                scroll={false}
                title="Open this day"
                className={`group min-h-28 space-y-1 border-b border-r border-surface-ink p-1.5 hover:outline-2 hover:outline-accent-red hover:-outline-offset-2 ${ADMIN_TYPE.focus} ${
                  d.verdict ? VERDICT_TINT[d.verdict.kind] : ''
                } ${!inMonth ? 'opacity-35' : past ? 'opacity-50' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`font-bold ${d.date === today ? 'bg-surface-ink text-surface-paper px-1' : ''}`}>
                    {Number(d.date.slice(8))}
                    {!inMonth && (d.date.slice(8) === '01' || d.date === first)
                      ? ` ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`
                      : ''}
                  </span>
                  {d.verdict && (
                    <span className={`${ADMIN_TYPE.overline} truncate ${VERDICT_MARK[d.verdict.kind]}`}>{d.verdict.label}</span>
                  )}
                </div>
                {on('shows') &&
                  d.shows.map((s) => (
                    <p key={s.id} className={`truncate font-bold ${s.announced ? 'text-spectrum-violet' : 'text-surface-ink/70'}`} title={s.title}>
                      {s.announced ? '' : 'Draft: '}{s.title}
                    </p>
                  ))}
                {on('booking') && d.plan?.title && (
                  <p className="truncate text-surface-ink/80" title={d.plan.notepad || d.plan.title}>
                    ✎ {d.plan.title}
                  </p>
                )}
                {on('blocks') &&
                  d.blocks.map((b) => (
                    <p key={b.id} className="truncate text-surface-ink/80" title={b.note}>
                      ■ {b.label}{b.note ? ` · ${b.note}` : ''}
                    </p>
                  ))}
                {on('rehearsal') &&
                  d.rehearsals.map((b) => (
                    <p
                      key={b.id}
                      className={`bg-surface-paper truncate px-1 py-0.5 ${
                        b.conflict
                          ? 'border-accent-red text-accent-red border-2 font-bold'
                          : b.shown === 'confirmed'
                            ? 'border-surface-ink border'
                            : 'border-surface-ink border border-dashed'
                      }`}
                    >
                      {b.conflict ? '⚠ ' : ''}{timeRange(b.startsAt, b.endsAt)} {b.bandName}
                    </p>
                  ))}
              </Link>
            );
          })}
        </div>
      </div>

      {drawer && (
        <div>
          <Link href={qs({ day: null })} scroll={false} aria-label="Close" className="bg-surface-ink/60 fixed inset-0 z-40" />
          <aside
            role="dialog"
            aria-label={drawer.date}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md space-y-5 overflow-y-auto border-l-2 border-surface-ink bg-surface-paper p-5 text-body-3"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className={ADMIN_TYPE.heading}>
                {new Date(`${drawer.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </h3>
              <Link href={qs({ day: null })} scroll={false} className={ADMIN_TYPE.link}>Close</Link>
            </div>

            <p className={`${ADMIN_TYPE.overline} ${drawer.verdict ? VERDICT_MARK[drawer.verdict.kind] : 'text-surface-ink/60'}`}>
              {drawer.verdict?.label ?? 'Nothing on'}
            </p>

            <section className="space-y-1">
              <span className={FORM.label}>Shows</span>
              {drawer.shows.length ? (
                <ul className="space-y-1">
                  {drawer.shows.map((s) => (
                    <li key={s.id}>
                      <Link href={`/admin/shows/${s.id}`} className={ADMIN_TYPE.link}>
                        {s.announced ? '' : 'Draft: '}{s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  <span className="text-surface-ink/60">None · </span>
                  <Link href={`/admin/events/new?date=${drawer.date}`} className={ADMIN_TYPE.link}>Add a show on this date</Link>
                </p>
              )}
            </section>

            <section className="space-y-1">
              <span className={FORM.label}>Booking</span>
              {drawer.plan?.title && <p className="font-bold">{drawer.plan.title}</p>}
              {drawer.plan?.notepad.trim() && <p className="whitespace-pre-wrap text-surface-ink/80">{drawer.plan.notepad}</p>}
              {availableSet.has(drawer.date) && <p>Marked available for a show</p>}
              {!drawer.plan && !availableSet.has(drawer.date) && (
                <p className="text-surface-ink/60">Nothing planned</p>
              )}
              <p>
                <Link href={`/admin/booking?date=${drawer.date}`} className={ADMIN_TYPE.link}>Open in Booking</Link>
              </p>
            </section>

            <section className="space-y-1">
              <span className={FORM.label}>Rehearsal</span>
              {drawer.rehearsals.map((b) => (
                <p key={b.id}>
                  <Link
                    href={`/admin/rehearsal/bands/${b.bandId}`}
                    className={`underline-offset-4 hover:underline ${b.conflict ? 'text-accent-red font-bold' : b.shown === 'confirmed' ? '' : 'text-surface-ink/70'}`}
                  >
                    {b.conflict ? '⚠ ' : ''}{timeRange(b.startsAt, b.endsAt)} {b.bandName} · {b.shown}
                  </Link>
                </p>
              ))}
              {drawer.rehearsals.length === 0 && <p className="text-surface-ink/60">No bookings</p>}
              <p>
                <Link href={`/admin/rehearsal/calendar?month=${drawer.date.slice(0, 7)}&day=${drawer.date}`} className={ADMIN_TYPE.link}>
                  Add a rehearsal
                </Link>
              </p>
            </section>

            <section className="space-y-1">
              <span className={FORM.label}>Blocks</span>
              <p className="text-data-caption-13 text-surface-ink/60">
                Your own not-available time. All day closes the date for shows; any block closes it for rehearsals.
              </p>
              <BlockEditor
                key={drawer.date}
                date={drawer.date}
                blocks={drawer.blocks.map((b) => ({ id: b.id, label: b.label, note: b.note, multiDay: b.multiDay }))}
              />
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
