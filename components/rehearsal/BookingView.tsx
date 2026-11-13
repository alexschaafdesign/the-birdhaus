'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import { describeRule, occurrenceStarts, type Freq, type SeriesRule } from '@/lib/rehearsal/series';

// The band's private booking page: their bookings, then an 8-ish-week grid of
// blocks (Open / Requested / Confirmed / Unavailable — never why), then the
// request form for the blocks they've picked. 2027 tokens only.

type State = 'open' | 'requested' | 'confirmed' | 'unavailable';
type PaymentMethod = 'venmo' | 'square' | 'cash';

export interface ViewBlock {
  date: string;
  startTime: string;
  start: string;
  end: string;
  state: State;
  bookingId: number | null;
}

export interface ViewBooking {
  id: number;
  catalogueId: string;
  start: string;
  end: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'expired';
  priceCents: number;
  gearNeeded: string[];
  gearNotes: string;
  note: string;
  declineReason: string;
  expiresAt: string;
  canCancel: boolean;
  repeatLabel: string | null;
}

export interface BookingViewProps {
  token: string;
  bandName: string;
  contactEmail: string;
  firstMonday: string;
  today: string; // Chicago date, for the calendar's today mark
  blocks: ViewBlock[];
  bookings: ViewBooking[];
  priceCents: number;
  repeatPriceCents: number; // per session in a repeating booking
  windowEnd: string; // ISO; repeats past it are skipped
  blockMinutes: number;
  cancelCutoffHours: number;
  pendingExpiryDays: number;
  gearOptions: string[];
  paymentMethods: PaymentMethod[];
  defaultGearNeeded: string[];
  defaultGearNotes: string;
}

const TZ = 'America/Chicago';
const METHOD_LABEL: Record<PaymentMethod, string> = { venmo: 'Venmo', square: 'Card', cash: 'Cash' };

// --- formatting (always Chicago, whatever the viewer's zone) -----------------

function hourLabel(iso: string): { text: string; ampm: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).formatToParts(
    new Date(iso),
  );
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const ampm = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();
  return { text: minute === '00' ? hour : `${hour}:${minute}`, ampm };
}

// "6–9pm", "10pm–1am"
function timeRange(start: string, end: string): string {
  const s = hourLabel(start);
  const e = hourLabel(end);
  return s.ampm === e.ampm ? `${s.text}–${e.text}${e.ampm}` : `${s.text}${s.ampm}–${e.text}${e.ampm}`;
}

// "Wed 18 Nov"
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

function dateParts(date: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(dt);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

const STATUS_TEXT: Record<ViewBooking['status'], string> = {
  pending: 'Requested',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

// --- block cell -------------------------------------------------------------

function BlockCell({
  block,
  selected,
  onToggle,
}: {
  block: ViewBlock;
  selected: boolean;
  onToggle: () => void;
}) {
  const label = timeRange(block.start, block.end);
  const base = 'text-data-caption-13 flex w-full items-center justify-between gap-2 border px-2 py-2 text-left';
  if (block.state === 'open') {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className={`${base} cursor-pointer focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 ${
          selected
            ? 'bg-surface-ink text-surface-paper border-surface-ink'
            : 'border-surface-ink ui-hover:bg-surface-paper-shade'
        }`}
      >
        <span className="font-bold">{label}</span>
        <span className="text-data-label-10-small uppercase">{selected ? 'Picked' : 'Open'}</span>
      </button>
    );
  }
  if (block.state === 'requested') {
    return (
      <div className={`${base} border-surface-ink border-dashed`}>
        <span className="font-bold">{label}</span>
        <span className="text-data-label-10-small uppercase">Requested</span>
      </div>
    );
  }
  if (block.state === 'confirmed') {
    return (
      <div className={`${base} bg-accent-red text-surface-paper border-accent-red`}>
        <span className="font-bold">{label}</span>
        <span className="text-data-label-10-small uppercase">Yours</span>
      </div>
    );
  }
  return (
    <div className={`${base} border-surface-ink/20 text-surface-ink/40`}>
      <span className="line-through decoration-1">{label}</span>
      <span className="text-data-label-10-small uppercase">Unavailable</span>
    </div>
  );
}

// A block inside a desktop calendar cell: just the time, state by style.
const STATE_WORD: Record<State, string> = {
  open: 'open',
  requested: 'requested, waiting for Alex',
  confirmed: 'confirmed, yours',
  unavailable: 'unavailable',
};

function Chip({ block, selected, onToggle }: { block: ViewBlock; selected: boolean; onToggle: () => void }) {
  const label = timeRange(block.start, block.end);
  const aria = `${dayLabel(block.start)} ${label}, ${selected ? 'picked' : STATE_WORD[block.state]}`;
  const base = 'text-data-caption-13 block w-full border px-1.5 py-1 text-left leading-tight';
  if (block.state === 'open') {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={aria}
        onClick={onToggle}
        className={`${base} cursor-pointer font-bold focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-1 ${
          selected ? 'bg-surface-ink text-surface-paper border-surface-ink' : 'border-surface-ink ui-hover:bg-surface-paper-shade'
        }`}
      >
        {label}
      </button>
    );
  }
  const look =
    block.state === 'requested'
      ? 'border-surface-ink border-dashed font-bold'
      : block.state === 'confirmed'
        ? 'bg-accent-red text-surface-paper border-accent-red font-bold'
        : 'border-transparent text-surface-ink/35 line-through decoration-1';
  return (
    <span aria-label={aria} className={`${base} ${look}`}>
      {label}
    </span>
  );
}

// A block on the phone calendar: a small square, state by style.
function Mark({ block, selected }: { block: ViewBlock; selected: boolean }) {
  const look = selected
    ? 'bg-surface-ink border-surface-ink'
    : block.state === 'open'
      ? 'border-surface-ink'
      : block.state === 'requested'
        ? 'border-surface-ink border-dashed'
        : block.state === 'confirmed'
          ? 'bg-accent-red border-accent-red'
          : 'border-surface-ink/20';
  return <span aria-hidden className={`inline-block size-2 border ${look}`} />;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// --- main -------------------------------------------------------------------

export default function BookingView(props: BookingViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [gear, setGear] = useState<string[]>(props.defaultGearNeeded);
  const [gearNotes, setGearNotes] = useState(props.defaultGearNotes);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(props.paymentMethods[0] ?? 'venmo');
  const [mode, setMode] = useState<'once' | 'repeat'>('once');
  const [freq, setFreq] = useState<Freq>('weekly');
  const [endBy, setEndBy] = useState<'count' | 'until'>('count');
  const [count, setCount] = useState(4);
  const [until, setUntil] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<{ id: number; message: string } | null>(null);

  // Calendar rows: Monday-start weeks from this week through the last block.
  const weeks = useMemo(() => {
    const last = props.blocks.length ? props.blocks[props.blocks.length - 1].date : props.firstMonday;
    const out: string[][] = [];
    for (let m = props.firstMonday; m <= last; m = addDays(m, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(m, i)));
    }
    return out;
  }, [props.blocks, props.firstMonday]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, ViewBlock[]>();
    for (const b of props.blocks) map.set(b.date, [...(map.get(b.date) ?? []), b]);
    return map;
  }, [props.blocks]);

  // Phone: the day whose blocks are listed under the calendar.
  const [openDay, setOpenDay] = useState<string | null>(
    () => props.blocks.find((b) => b.state === 'open')?.date ?? null,
  );

  // Only blocks still open count (a refresh may have taken one).
  const picked = props.blocks.filter((b) => b.state === 'open' && selected.includes(b.start));

  // Repeat preview: every occurrence, and whether it's open right now. The
  // server re-checks; anything not open is skipped, not requested.
  const repeating = mode === 'repeat' && picked.length === 1;
  const rule: SeriesRule | null = repeating
    ? endBy === 'count'
      ? { freq, count }
      : until
        ? { freq, until }
        : null
    : null;
  const openStarts = useMemo(
    () => new Set(props.blocks.filter((b) => b.state === 'open').map((b) => new Date(b.start).getTime())),
    [props.blocks],
  );
  const preview =
    repeating && rule
      ? occurrenceStarts(new Date(picked[0].start), rule).map((d) => ({
          start: d,
          end: new Date(d.getTime() + props.blockMinutes * 60_000),
          state: openStarts.has(d.getTime()) ? 'open' : d.getTime() >= new Date(props.windowEnd).getTime() ? 'too_far' : 'unavailable',
        }))
      : [];
  const bookable = preview.filter((p) => p.state === 'open').length;

  function toggle(start: string) {
    setSent(null);
    setError(null);
    setSelected((s) => (s.includes(start) ? s.filter((x) => x !== start) : [...s, start]));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (picked.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starts: picked.map((b) => b.start),
          repeat: repeating ? rule : null,
          note,
          gearNeeded: gear,
          gearNotes,
          paymentMethod: method,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'That didn’t go through — try again.');
        if (res.status === 409) {
          setSelected([]);
          router.refresh();
        }
        return;
      }
      const n = data.catalogueIds.length;
      const skipped: Array<{ start: string; why: string }> = data.skipped ?? [];
      setSent(
        `Request sent for ${n} session${n === 1 ? '' : 's'} (${data.catalogueIds.join(', ')}). ` +
          (() => {
            const list = (why: string) => skipped.filter((x) => x.why === why).map((x) => dayLabel(x.start));
            const taken = list('unavailable');
            const far = list('too_far');
            return (
              (taken.length ? `Skipped (not available): ${taken.join(', ')}. ` : '') +
              (far.length ? `Not requested yet, too far ahead: ${far.join(', ')} — ask again nearer the time. ` : '')
            );
          })() +
          `Alex will confirm by email; if there's no answer in ${props.pendingExpiryDays} days the request lapses and the time frees up.`,
      );
      setMode('once');
      setSelected([]);
      setNote('');
      router.refresh();
    } catch {
      setError('That didn’t go through — check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function cancel(b: ViewBooking) {
    const what = `${dayLabel(b.start)}, ${timeRange(b.start, b.end)}`;
    if (!confirm(`Cancel ${what}?`)) return;
    setCancelling(b.id);
    setCancelError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setCancelError({ id: b.id, message: data?.error ?? 'Couldn’t cancel — try again.' });
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  const upcoming = props.bookings;
  const hours = props.blockMinutes % 60 === 0 ? `${props.blockMinutes / 60}-hour` : `${props.blockMinutes}-minute`;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-10">
      <section aria-labelledby="hello" className="text-body-3 flex flex-col gap-3 leading-normal">
        <SectionHeader id="hello" label={`Rehearsal space · ${props.bandName}`} rule="m" />
        <p className="max-w-2xl">
          Pick one or more open {hours} blocks below and send a request. Alex confirms by email with the address and
          payment details. {money(props.priceCents)} per block.
        </p>
      </section>

      {/* Your bookings */}
      <section aria-labelledby="yours" className="flex flex-col gap-3">
        <SectionHeader
          id="yours"
          label="Your bookings"
          count={upcoming.filter((b) => b.status === 'pending' || b.status === 'confirmed').length}
        />
        {upcoming.length === 0 ? (
          <p className="text-body-3 opacity-70">Nothing booked yet.</p>
        ) : (
          <ul className="divide-surface-ink/20 border-surface-ink/20 divide-y border-y">
            {upcoming.map((b) => (
              <li key={b.id} className="text-body-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
                <span className="text-data-caption-13 text-text-meta w-24 shrink-0">{b.catalogueId}</span>
                <span className="min-w-40 font-bold">
                  {dayLabel(b.start)} · {timeRange(b.start, b.end)}
                </span>
                <span
                  className={`text-data-overline-11 font-bold tracking-[--spacing(0.625)] uppercase ${
                    b.status === 'confirmed' ? 'text-accent-red' : ''
                  } ${b.status === 'pending' || b.status === 'confirmed' ? '' : 'opacity-60'}`}
                >
                  {STATUS_TEXT[b.status]}
                </span>
                {b.repeatLabel && <span className="opacity-70">↻ {b.repeatLabel}</span>}
                {b.gearNeeded.length > 0 || b.gearNotes ? (
                  <span className="opacity-70">Gear: {[b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — ')}</span>
                ) : null}
                {b.status === 'declined' && b.declineReason && <span className="opacity-70">{b.declineReason}</span>}
                <span className="ml-auto">
                  {b.canCancel ? (
                    <button
                      type="button"
                      onClick={() => cancel(b)}
                      disabled={cancelling === b.id}
                      className={`${FORM.link} text-body-3 disabled:opacity-40`}
                    >
                      {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : b.status === 'pending' || b.status === 'confirmed' ? (
                    <span className="opacity-70">
                      Need to change it?{' '}
                      <a href={`mailto:${props.contactEmail}?subject=${encodeURIComponent(b.catalogueId)}`} className={FORM.link}>
                        Email Alex
                      </a>
                    </span>
                  ) : null}
                </span>
                {cancelError?.id === b.id && (
                  <p role="alert" className={`${FORM.error} basis-full`}>
                    {cancelError.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-body-3 opacity-70">
          You can cancel here up to {props.cancelCutoffHours} hours before a session.
        </p>
      </section>

      {/* Calendar */}
      <section aria-labelledby="pick" className="flex flex-col gap-4">
        <SectionHeader id="pick" label="Pick blocks" />
        {props.blocks.length === 0 ? (
          <p className="text-body-3 opacity-70">No blocks are on the calendar right now — check back soon.</p>
        ) : (
          <>
            <ul className="text-data-caption-13 flex flex-wrap gap-x-5 gap-y-1 opacity-80" aria-label="Key">
              <li className="flex items-center gap-1.5"><span className="border-surface-ink inline-block size-3 border" />Open</li>
              <li className="flex items-center gap-1.5"><span className="bg-surface-ink inline-block size-3" />Picked</li>
              <li className="flex items-center gap-1.5"><span className="border-surface-ink inline-block size-3 border border-dashed" />Requested</li>
              <li className="flex items-center gap-1.5"><span className="bg-accent-red inline-block size-3" />Confirmed</li>
              <li className="flex items-center gap-1.5"><span className="border-surface-ink/20 inline-block size-3 border" />Unavailable</li>
            </ul>

            <div role="grid" aria-label="Rehearsal calendar" className="border-surface-ink border-t">
              <div role="row" className="border-surface-ink grid grid-cols-7 border-b">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    role="columnheader"
                    className="text-data-overline-11 py-2 text-center font-bold tracking-[--spacing(0.625)] uppercase lg:text-left lg:pl-1.5"
                  >
                    {w}
                  </div>
                ))}
              </div>
              {weeks.map((days) => (
                <div key={days[0]} role="row" className="border-surface-ink/20 grid grid-cols-7 border-b">
                  {days.map((d) => {
                    const p = dateParts(d);
                    const list = blocksByDay.get(d) ?? [];
                    const past = d < props.today;
                    const isToday = d === props.today;
                    const firstOfMonth = p.day === '1' || d === days[0] && d === props.firstMonday;
                    const dateLabel = (
                      <span className="flex items-baseline gap-1">
                        <span
                          className={`text-data-caption-13 inline-flex min-w-6 justify-center font-bold ${
                            isToday ? 'bg-accent-red text-surface-paper px-1' : ''
                          }`}
                        >
                          {p.day}
                        </span>
                        {firstOfMonth && (
                          <span className="text-data-label-10-small text-accent-red font-bold uppercase">{p.month}</span>
                        )}
                      </span>
                    );
                    return (
                      <div
                        key={d}
                        role="gridcell"
                        className={`border-surface-ink/20 min-h-14 border-r p-1 last:border-r-0 lg:min-h-24 lg:p-1.5 ${
                          past ? 'opacity-40' : ''
                        }`}
                      >
                        {/* Phone: the whole cell picks the day */}
                        <button
                          type="button"
                          onClick={() => setOpenDay(d)}
                          disabled={list.length === 0}
                          aria-label={`${dayLabel(`${d}T18:00:00Z`)}: ${list.filter((b) => b.state === 'open').length} open`}
                          aria-pressed={openDay === d}
                          className={`flex h-full w-full flex-col items-center gap-1 lg:hidden ${
                            openDay === d ? 'outline-surface-ink outline-2 -outline-offset-2' : ''
                          } disabled:cursor-default`}
                        >
                          {dateLabel}
                          <span className="flex flex-wrap justify-center gap-0.5">
                            {list.map((b) => (
                              <Mark key={b.start} block={b} selected={selected.includes(b.start)} />
                            ))}
                          </span>
                        </button>
                        {/* Desktop: blocks right in the cell */}
                        <div className="hidden flex-col gap-1 lg:flex">
                          {dateLabel}
                          {list.map((b) => (
                            <Chip
                              key={b.start}
                              block={b}
                              selected={selected.includes(b.start)}
                              onToggle={() => toggle(b.start)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Phone: the chosen day's blocks */}
            {openDay && (
              <div className="flex flex-col gap-2 lg:hidden">
                <h3 className="text-data-overline-11 font-bold tracking-[--spacing(0.625)] uppercase">
                  {(() => {
                    const p = dateParts(openDay);
                    return `${p.weekday} ${p.day} ${p.month}`;
                  })()}
                </h3>
                {(blocksByDay.get(openDay) ?? []).map((b) => (
                  <BlockCell key={b.start} block={b} selected={selected.includes(b.start)} onToggle={() => toggle(b.start)} />
                ))}
              </div>
            )}
            <p className="text-body-3 opacity-70">All times are Minneapolis time.</p>
          </>
        )}
      </section>

      {/* Request */}
      <section aria-labelledby="request" className="flex max-w-2xl flex-col gap-4">
        <SectionHeader id="request" label="Send a request" />
        {sent && (
          <p role="status" className={FORM.notice}>
            {sent}
          </p>
        )}
        {picked.length === 0 ? (
          <p className="text-body-3 opacity-70">Pick one or more open blocks above.</p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-5">
            <div>
              <p className={FORM.label}>
                {repeating
                  ? `${bookable} session${bookable === 1 ? '' : 's'} · ${money(props.repeatPriceCents * bookable)}`
                  : `${picked.length} block${picked.length === 1 ? '' : 's'} · ${money(props.priceCents * picked.length)}`}
              </p>
              <ul className="text-body-3 flex flex-col gap-1">
                {picked.map((b) => (
                  <li key={b.start} className="flex items-baseline justify-between gap-4">
                    <span>
                      {dayLabel(b.start)} · {timeRange(b.start, b.end)}
                    </span>
                    <button type="button" onClick={() => toggle(b.start)} className={FORM.link}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <fieldset>
              <legend className={FORM.label}>Once or repeating?</legend>
              <div className="text-body-3 flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'once'}
                    onChange={() => setMode('once')}
                    className="accent-accent-red size-4"
                  />
                  Just {picked.length === 1 ? 'this one' : 'these'}
                </label>
                <label className={`flex items-center gap-2 ${picked.length === 1 ? 'cursor-pointer' : 'opacity-40'}`}>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'repeat'}
                    disabled={picked.length !== 1}
                    onChange={() => setMode('repeat')}
                    className="accent-accent-red size-4"
                  />
                  Repeat {picked.length !== 1 && <span className="opacity-70">(pick one block to repeat)</span>}
                </label>
              </div>
            </fieldset>

            {repeating && (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="freq" className={FORM.label}>
                    How often
                  </label>
                  <select id="freq" value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className={FORM.field}>
                    {(['weekly', 'biweekly', 'monthly_nth'] as const).map((f) => (
                      <option key={f} value={f}>
                        {describeRule(picked[0].date, f)}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className={FORM.label}>Ends</legend>
                  <div className="text-body-3 flex flex-col gap-2">
                    <label className="flex cursor-pointer flex-wrap items-center gap-2">
                      <input
                        type="radio"
                        name="endBy"
                        checked={endBy === 'count'}
                        onChange={() => setEndBy('count')}
                        className="accent-accent-red size-4"
                      />
                      After
                      <input
                        type="number"
                        min={2}
                        max={52}
                        value={count}
                        onChange={(e) => {
                          setEndBy('count');
                          setCount(Math.max(2, Math.min(52, Number(e.target.value) || 2)));
                        }}
                        aria-label="Number of sessions"
                        className={`${FORM.field.replace('w-full', '')} w-20`}
                      />
                      sessions
                    </label>
                    <label className="flex cursor-pointer flex-wrap items-center gap-2">
                      <input
                        type="radio"
                        name="endBy"
                        checked={endBy === 'until'}
                        onChange={() => setEndBy('until')}
                        className="accent-accent-red size-4"
                      />
                      On
                      <input
                        type="date"
                        value={until}
                        min={picked[0].date}
                        onChange={(e) => {
                          setEndBy('until');
                          setUntil(e.target.value);
                        }}
                        aria-label="Last date"
                        className={`${FORM.field.replace('w-full', '')} w-auto`}
                      />
                    </label>
                  </div>
                </fieldset>
                {preview.length > 0 && (
                  <ul className="text-body-3 flex flex-col gap-1" aria-label="Dates in this repeat">
                    {preview.map((o) => (
                      <li key={o.start.getTime()} className={`flex justify-between gap-4 ${o.state === 'open' ? '' : 'opacity-50'}`}>
                        <span className={o.state === 'open' ? '' : 'line-through decoration-1'}>
                          {dayLabel(o.start.toISOString())} · {timeRange(o.start.toISOString(), o.end.toISOString())}
                        </span>
                        <span className="text-data-label-10-small uppercase">
                          {o.state === 'open' ? 'Open' : o.state === 'too_far' ? 'Too far ahead' : 'Unavailable'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {preview.some((o) => o.state !== 'open') && (
                  <p className="text-body-3 opacity-70">
                    Dates that aren&apos;t open are skipped. Dates past the booking window can be requested later.
                  </p>
                )}
              </div>
            )}

            {props.gearOptions.length > 0 && (
              <fieldset>
                <legend className={FORM.label}>Gear you&apos;ll need (optional)</legend>
                <div className="text-body-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {props.gearOptions.map((g) => (
                    <label key={g} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={gear.includes(g)}
                        onChange={(e) => setGear(e.target.checked ? [...gear, g] : gear.filter((x) => x !== g))}
                        className="accent-accent-red size-4"
                      />
                      {g}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <label htmlFor="gear-notes" className={FORM.label}>
                Gear notes (optional)
              </label>
              <input
                id="gear-notes"
                value={gearNotes}
                onChange={(e) => setGearNotes(e.target.value)}
                maxLength={500}
                placeholder="e.g. 2 vocal mics; bringing our own kit, just need the throne"
                className={FORM.field}
              />
            </div>

            <div>
              <label htmlFor="note" className={FORM.label}>
                Note to Alex (optional)
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                className={FORM.field}
              />
            </div>

            {props.paymentMethods.length > 1 ? (
              <fieldset>
                <legend className={FORM.label}>How you&apos;ll pay</legend>
                <div className="text-body-3 flex flex-wrap gap-x-6 gap-y-2">
                  {props.paymentMethods.map((m) => (
                    <label key={m} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="method"
                        checked={method === m}
                        onChange={() => setMethod(m)}
                        className="accent-accent-red size-4"
                      />
                      {METHOD_LABEL[m]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-body-3 opacity-70">You&apos;ll pay by Venmo once Alex confirms.</p>
            )}

            {error && (
              <p role="alert" className={FORM.error}>
                {error}
              </p>
            )}
            <button type="submit" disabled={sending || (repeating && (!rule || bookable === 0))} className={FORM.primary}>
              {sending
                ? 'Sending…'
                : repeating
                  ? `Request ${bookable} session${bookable === 1 ? '' : 's'}`
                  : `Request ${picked.length} block${picked.length === 1 ? '' : 's'}`}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
