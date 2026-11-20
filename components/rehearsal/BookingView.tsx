'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import { describeRule, occurrenceStarts, type Freq, type SeriesRule } from '@/lib/rehearsal/series';
import { planRequest, type RequestItem } from '@/lib/rehearsal/request-rules';
import { onGrid, startOptions, subtract } from '@/lib/rehearsal/availability';
import { estimateLine, type RateCardInput } from '@/lib/rehearsal/estimate';
import SeriesList, { type SeriesView } from './SeriesList';

// The band's private booking page. Their bookings, then a calendar of days.
// Each day shows its open time as a strip (never why the rest is closed).
// Tapping a day opens a panel right there (a sheet on phones): pick a start
// time, then a length (only lengths that fit), then once or repeating. Picks
// collect in a bar pinned to the bottom of the screen; "Review and send"
// takes gear and a note, and shows a soft usual-rate line per pick. If a band
// picks the same time on consecutive weeks, the bar offers to make it weekly.
// 2027 tokens only.

type PaymentMethod = 'venmo' | 'square' | 'cash';

export interface ViewSpan {
  start: string; // ISO
  end: string;
}

export interface ViewDay {
  date: string; // Chicago date
  window: ViewSpan | null; // bookable window; null = closed that day
  free: ViewSpan[];
  own: Array<ViewSpan & { bookingId: number; state: 'requested' | 'confirmed' }>;
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
  // Its day's open time if it moved (its own time counts as free); null = can't be changed.
  changeFree: ViewSpan[] | null;
  // A change the band asked for that's waiting for Alex (the original stays until then).
  pendingChange: (ViewSpan & { id: number; note: string }) | null;
}

export interface BookingViewProps {
  token: string;
  bandName: string;
  contactEmail: string;
  today: string; // Chicago date, for the calendar's today mark
  days: ViewDay[];
  startStepMinutes: number;
  allowedLengths: number[]; // minutes
  bufferMinutes: number;
  rates: RateCardInput | null; // null = no estimates shown
  bookings: ViewBooking[];
  paymentsEnabled: boolean; // off = no prices or payment choice anywhere on the page
  priceCents: number;
  repeatPriceCents: number; // per session in a repeating booking
  windowEnd: string; // ISO; repeats past it are booked later, after approval
  cancelCutoffHours: number;
  pendingExpiryDays: number;
  gearOptions: string[];
  paymentMethods: PaymentMethod[];
  defaultGearNeeded: string[];
  defaultGearNotes: string;
  series: SeriesView[];
}

// One pick: a start time + length, once or repeating.
interface Item {
  start: string; // ISO
  minutes: number;
  repeat: SeriesRule | null;
}

const TZ = 'America/Chicago';
const METHOD_LABEL: Record<PaymentMethod, string> = { venmo: 'Venmo', square: 'Card', cash: 'Cash' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FOCUS = 'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';
const SOFT = " — or whatever works, we'll sort it out";
// Gear picks are hidden on the review sheet for now (just the note). The
// band's last gear choice is still sent, so admin and emails are unchanged.
const SHOW_GEAR = false;

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

// "2:30pm"
function clock(iso: string): string {
  const h = hourLabel(iso);
  return `${h.text}${h.ampm}`;
}

// "6–9pm", "10am–1pm"
function timeRange(start: string, end: string): string {
  const s = hourLabel(start);
  const e = hourLabel(end);
  if (e.text === '12' && e.ampm === 'am') return `${s.text}${s.ampm}–midnight`;
  return s.ampm === e.ampm ? `${s.text}–${e.text}${e.ampm}` : `${s.text}${s.ampm}–${e.text}${e.ampm}`;
}

// "Wed 18 Nov"
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

function chicagoDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function dateParts(date: string): { weekday: string; long: string; day: string; month: string } {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(dt);
  return { weekday: f({ weekday: 'short' }), long: f({ weekday: 'long' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The Sunday on or before a date.
function sundayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

// "YYYY-MM" shifted by n months.
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string, o: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o }).format(new Date(`${month}-01T12:00:00Z`));
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function lengthLabel(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}

function endOf(start: string, minutes: number): string {
  return new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
}

const STATUS_TEXT: Record<ViewBooking['status'], string> = {
  pending: 'Requested',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const toSpan = (s: ViewSpan) => ({ start: new Date(s.start), end: new Date(s.end) });

// --- calendar cells -----------------------------------------------------------

// The day's open time as a strip across its bookable window.
function OpenStrip({ day }: { day: ViewDay }) {
  if (!day.window) return null;
  const w0 = new Date(day.window.start).getTime();
  const span = new Date(day.window.end).getTime() - w0;
  return (
    <span aria-hidden className="bg-surface-ink/10 relative block h-1.5 w-full overflow-hidden">
      {day.free.map((f) => (
        <span
          key={f.start}
          className="bg-surface-ink absolute inset-y-0"
          style={{
            left: `${((new Date(f.start).getTime() - w0) / span) * 100}%`,
            width: `${((new Date(f.end).getTime() - new Date(f.start).getTime()) / span) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

type Session = { start: string; end: string; kind: 'picked' | 'repeat' | 'requested' | 'confirmed'; item?: number };

function SessionChip({ s, onEdit }: { s: Session; onEdit?: () => void }) {
  const label = timeRange(s.start, s.end);
  const base = 'text-data-caption-13 block w-full border px-1 py-0.5 text-left leading-tight';
  const look =
    s.kind === 'picked' || s.kind === 'repeat'
      ? 'bg-surface-ink text-surface-paper border-surface-ink'
      : s.kind === 'requested'
        ? 'border-surface-ink border-dashed'
        : 'bg-accent-red text-surface-paper border-accent-red';
  const word = s.kind === 'requested' ? 'requested, waiting for Alex' : s.kind === 'confirmed' ? 'confirmed, yours' : 'in your request';
  if (onEdit) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`${dayLabel(s.start)} ${label}, ${word} — edit`}
        className={`${base} ${look} cursor-pointer font-bold ${FOCUS}`}
      >
        {s.kind === 'repeat' && <span aria-hidden>↻ </span>}
        {label}
      </button>
    );
  }
  return (
    <span aria-label={`${dayLabel(s.start)} ${label}, ${word}`} className={`${base} ${look} font-bold`}>
      {label}
    </span>
  );
}

// --- the pick panel ---------------------------------------------------------------

// One end of the time being picked. Empty and active = dashed ("pick me");
// filled = solid, tap to change.
function TimeSlot({
  label,
  value,
  active,
  onChange,
}: {
  label: string;
  value: string | null;
  active: boolean;
  onChange: () => void;
}) {
  const box = 'flex min-w-24 flex-col items-start border-2 px-3 py-1.5 text-left';
  const inner = (
    <>
      <span className="text-data-label-10-small font-bold tracking-[--spacing(0.625)] uppercase opacity-60">{label}</span>
      <span className="font-bold">{value ?? (active ? 'Pick…' : '—')}</span>
    </>
  );
  if (value) {
    return (
      <button
        type="button"
        onClick={onChange}
        aria-label={`${label} ${value} — change`}
        className={`${box} border-surface-ink ui-hover:bg-surface-paper-shade cursor-pointer ${FOCUS}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <span aria-current={active ? 'step' : undefined} className={`${box} ${active ? 'border-surface-ink border-dashed' : 'border-surface-ink/20 border-dashed opacity-50'}`}>
      {inner}
    </span>
  );
}

type Choice = 'once' | Freq;

function PickPanel({
  day,
  existing,
  others,
  pos,
  isOpen,
  windowEnd,
  props,
  onSave,
  onRemove,
  onClose,
  changing = false,
}: {
  changing?: boolean; // moving a booking: one session, no repeats
  day: ViewDay;
  existing: Item | null;
  others: Item[]; // the request's other picks (their sessions are taken)
  pos: { top: number; left: number } | null; // desktop anchor inside the calendar
  isOpen: (start: Date, minutes: number) => boolean;
  windowEnd: Date;
  props: BookingViewProps;
  onSave: (item: Item) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState<string | null>(existing?.start ?? null);
  const [minutes, setMinutes] = useState<number | null>(existing?.minutes ?? null);
  const [choice, setChoice] = useState<Choice>(existing?.repeat?.freq ?? 'once');
  const [endBy, setEndBy] = useState<'count' | 'until' | 'ongoing'>(
    existing?.repeat ? (existing.repeat.until ? 'until' : existing.repeat.count ? 'count' : 'ongoing') : 'count',
  );
  const [count, setCount] = useState(existing?.repeat?.count ?? 6);
  const [until, setUntil] = useState(existing?.repeat?.until ?? '');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // This day's free time minus the request's other picks (+ the buffer).
  const buf = props.bufferMinutes * 60_000;
  const taken = useMemo(() => {
    const plan = planRequest(
      others.map((o) => ({ start: new Date(o.start), minutes: o.minutes, repeat: o.repeat })),
      isOpen,
      windowEnd,
      props.bufferMinutes,
    );
    return plan.sessions.map((s) => ({ start: new Date(s.start.getTime() - buf), end: new Date(s.end.getTime() + buf) }));
  }, [others, isOpen, windowEnd, props.bufferMinutes, buf]);
  const free = useMemo(() => {
    const out = [];
    for (const f of day.free.map(toSpan)) out.push(...subtract(f, taken));
    return out;
  }, [day.free, taken]);
  const starts = useMemo(
    () => startOptions(free, { startStepMinutes: props.startStepMinutes, allowedLengths: props.allowedLengths }, windowEnd),
    [free, props.startStepMinutes, props.allowedLengths, windowEnd],
  );
  const chosen = starts.find((o) => o.start.toISOString() === start) ?? null;
  // A start or length that no longer fits (picks changed) drops back a step.
  const len = chosen && minutes && chosen.lengths.includes(minutes) ? minutes : null;

  const rule = useMemo<SeriesRule | null>(
    () =>
      choice === 'once'
        ? null
        : endBy === 'ongoing'
          ? { freq: choice }
          : endBy === 'count'
            ? { freq: choice, count }
            : until
              ? { freq: choice, until }
              : null,
    [choice, endBy, count, until],
  );

  // Preview this pick's dates with the same planner as the server.
  const preview = useMemo(() => {
    if (!start || !len) return null;
    const items: RequestItem[] = [
      ...others.map((o) => ({ start: new Date(o.start), minutes: o.minutes, repeat: o.repeat })),
      { start: new Date(start), minutes: len, repeat: rule },
    ];
    const plan = planRequest(items, isOpen, windowEnd, props.bufferMinutes);
    const me = items.length - 1;
    const dates = [
      ...plan.sessions.filter((x) => x.item === me).map((x) => ({ d: x.start, open: true })),
      ...plan.skipped.filter((x) => x.item === me).map((x) => ({ d: x.start, open: false })),
    ].sort((a, b) => a.d.getTime() - b.d.getTime());
    return { dates, later: plan.later[me], closed: plan.closed.includes(me) };
  }, [start, len, rule, others, isOpen, windowEnd, props.bufferMinutes]);
  const openCount = preview ? preview.dates.filter((x) => x.open).length : 0;

  const p = dateParts(day.date);
  const options: Array<[Choice, string]> = [
    ['once', 'Just this one'],
    ['weekly', `Every ${p.long}`],
    ['biweekly', `Every other ${p.long}`],
    ['monthly_nth', describeRule(day.date, 'monthly_nth').replace(/^Monthly on the/, 'Monthly, the')],
  ];
  const stretches = free.filter((f) => starts.some((o) => o.start >= f.start && o.start < f.end));
  const chipBase = `text-data-caption-13 cursor-pointer border px-2 py-1.5 ${FOCUS}`;
  const chipOff = 'border-surface-ink ui-hover:bg-surface-paper-shade';

  return (
    <>
      {/* Backdrop: dims on phones, invisible on desktop; a click outside closes. */}
      <div aria-hidden onClick={onClose} className="bg-surface-ink/40 fixed inset-0 z-40 lg:bg-transparent" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${p.long} ${p.day} ${p.month}`}
        style={pos ? ({ '--px': `${pos.left}px`, '--py': `${pos.top}px` } as React.CSSProperties) : undefined}
        className={`bg-surface-paper border-surface-ink text-body-3 fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-4 overflow-y-auto border-t-2 p-4 pb-6 lg:inset-x-auto lg:bottom-auto lg:max-h-[80vh] lg:w-[26rem] lg:border-2 ${
          pos ? 'lg:absolute lg:top-(--py) lg:left-(--px)' : 'lg:top-1/4 lg:left-1/2 lg:-translate-x-1/2'
        }`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-bold">
              {p.long} {p.day} {p.month}
            </p>
            <p className="text-data-caption-13 opacity-70">
              {stretches.length
                ? `Open ${stretches.map((f) => timeRange(f.start.toISOString(), f.end.toISOString())).join(' · ')}`
                : 'Nothing open this day.'}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={`${FORM.link} text-data-caption-13`}>
            Close
          </button>
        </div>

        {day.own.length > 0 && (
          <p className="text-data-caption-13">
            Yours this day:{' '}
            {day.own.map((o) => `${timeRange(o.start, o.end)} (${o.state === 'confirmed' ? 'confirmed' : 'requested'})`).join(', ')}
          </p>
        )}

        {starts.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* The time so far, start → end. A filled slot is tappable to
                change it; the slot being picked is dashed. */}
            <div className="flex items-stretch gap-2">
              <TimeSlot
                label="Start"
                value={chosen ? clock(chosen.start.toISOString()) : null}
                active={!chosen}
                onChange={() => {
                  setStart(null);
                  setMinutes(null);
                }}
              />
              <span aria-hidden className="self-center opacity-50">
                →
              </span>
              <TimeSlot
                label="End"
                value={chosen && len ? clock(endOf(chosen.start.toISOString(), len)) : null}
                active={Boolean(chosen) && !len}
                onChange={() => setMinutes(null)}
              />
              {chosen && len && <span className="text-data-caption-13 self-center opacity-70">{lengthLabel(len)}</span>}
            </div>

            {!chosen && (
              <fieldset className="flex flex-col gap-2">
                <legend className={FORM.label}>Pick a start time</legend>
                <div className="flex flex-wrap gap-1.5">
                  {starts.map((o) => {
                    const iso = o.start.toISOString();
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setStart(iso);
                          setMinutes(null);
                        }}
                        className={`${chipBase} ${chipOff}`}
                      >
                        {clock(iso)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {chosen && !len && (
              <fieldset className="flex flex-col gap-2">
                <legend className={FORM.label}>Pick an end time</legend>
                <div className="flex flex-wrap gap-1.5">
                  {chosen.lengths.map((m) => (
                    <button key={m} type="button" onClick={() => setMinutes(m)} className={`${chipBase} ${chipOff}`}>
                      {clock(endOf(chosen.start.toISOString(), m))}
                      <span className="ml-1.5 opacity-60">{lengthLabel(m)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {start && len && changing && (
          <p className="opacity-70">
            {timeRange(start, endOf(start, len))} ({lengthLabel(len)}).
          </p>
        )}

        {start && len && !changing && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className={FORM.label}>Once or repeating</legend>
              {options.map(([value, text]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="choice"
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                    className="accent-accent-red size-4"
                  />
                  {text}
                </label>
              ))}
            </fieldset>

            {choice !== 'once' && (
              <div className="flex flex-col gap-2">
                <p className={FORM.label}>Ends</p>
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
                    min={day.date}
                    onChange={(e) => {
                      setEndBy('until');
                      setUntil(e.target.value);
                    }}
                    aria-label="Last date"
                    className={`${FORM.field.replace('w-full', '')} w-auto`}
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="endBy"
                    checked={endBy === 'ongoing'}
                    onChange={() => setEndBy('ongoing')}
                    className="accent-accent-red size-4"
                  />
                  Until we end it
                </label>
                {preview && preview.dates.length > 0 && (
                  <ul className="text-data-caption-13 flex max-h-40 flex-col gap-0.5 overflow-y-auto" aria-label="Dates">
                    {preview.dates.map((x) => (
                      <li key={x.d.getTime()} className={`flex justify-between gap-4 ${x.open ? '' : 'opacity-50'}`}>
                        <span className={x.open ? '' : 'line-through decoration-1'}>{dayLabel(x.d.toISOString())}</span>
                        <span className="uppercase">{x.open ? 'Open' : 'Unavailable'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="opacity-70">
              {timeRange(start, endOf(start, len))} ({lengthLabel(len)}).{' '}
              {choice === 'once'
                ? props.paymentsEnabled
                  ? money(props.priceCents)
                  : 'Just this one.'
                : rule && preview
                  ? `${openCount} session${openCount === 1 ? '' : 's'} now${
                      props.paymentsEnabled ? ` · ${money(openCount * props.repeatPriceCents)}` : ''
                    }${openCount < preview.dates.length ? " — dates that aren't free are skipped" : ''}. ${
                      endBy === 'ongoing'
                        ? 'After that it keeps going, booked automatically once Alex approves, until you end it.'
                        : preview.later
                          ? `${preview.later} more ${preview.later === 1 ? 'is' : 'are'} booked automatically as ${preview.later === 1 ? 'it comes' : 'they come'} into the booking window, once Alex approves.`
                          : ''
                    }`
                  : 'Pick an end date.'}
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {existing && !changing && (
            <button type="button" onClick={onRemove} className={`${FORM.link} mr-auto`}>
              Remove
            </button>
          )}
          <button
            type="button"
            disabled={!start || !len || Boolean(preview?.closed) || (choice !== 'once' && (!rule || openCount === 0))}
            onClick={() => start && len && onSave({ start, minutes: len, repeat: rule })}
            className={`${FORM.primary} w-auto`}
          >
            {changing ? 'Next' : existing ? 'Update' : 'Add to request'}
          </button>
        </div>
      </div>
    </>
  );
}

// --- main -------------------------------------------------------------------

export default function BookingView(props: BookingViewProps) {
  const router = useRouter();
  const calendarRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  // The open panel: a day, and the pick being edited (index into items) if any.
  const [panel, setPanel] = useState<{ date: string; edit: number | null; pos: { top: number; left: number } | null } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [gear, setGear] = useState<string[]>(props.defaultGearNeeded);
  const [gearNotes, setGearNotes] = useState(props.defaultGearNotes);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(props.paymentMethods[0] ?? 'venmo');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<{ id: number; message: string } | null>(null);
  // Changing a booking: which one, and (once picked) the new time + note.
  const [changing, setChanging] = useState<ViewBooking | null>(null);
  const [changePick, setChangePick] = useState<{ start: string; minutes: number } | null>(null);
  const [changeNote, setChangeNote] = useState('');

  const windowEnd = useMemo(() => new Date(props.windowEnd), [props.windowEnd]);
  // While changing a booking, its own time counts as open on its day.
  const days = useMemo(() => {
    if (!changing?.changeFree) return props.days;
    const date = chicagoDateOf(changing.start);
    return props.days.map((d) => (d.date === date ? { ...d, free: changing.changeFree! } : d));
  }, [props.days, changing]);
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  // Same rule as the server (isOpenSpan): on the grid, an allowed length,
  // inside one free stretch, starting inside the window.
  const isOpen = useMemo(() => {
    const rules = { startStepMinutes: props.startStepMinutes, allowedLengths: props.allowedLengths };
    return (start: Date, minutes: number) => {
      if (!rules.allowedLengths.includes(minutes) || !onGrid(start, rules.startStepMinutes) || start >= windowEnd) return false;
      const end = start.getTime() + minutes * 60_000;
      const day = dayByDate.get(chicagoDateOf(start.toISOString()));
      return Boolean(day?.free.some((f) => new Date(f.start) <= start && end <= new Date(f.end).getTime()));
    };
  }, [props.startStepMinutes, props.allowedLengths, windowEnd, dayByDate]);

  // One month at a time: this month through the month of the last bookable day.
  const firstMonth = props.today.slice(0, 7);
  const lastMonth = props.days.length ? props.days[props.days.length - 1].date.slice(0, 7) : firstMonth;
  const [month, setMonth] = useState(firstMonth);
  // Calendar rows: Sunday-start weeks covering the month; days spilling in
  // from the months either side are shown faded.
  const weeks = useMemo(() => {
    const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
    const out: string[][] = [];
    for (let w = sundayOf(`${month}-01`); w <= last; w = addDays(w, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    return out;
  }, [month]);
  function goMonth(n: number) {
    setPanel(null);
    setMonth((m) => shiftMonth(m, n));
  }

  // What the request books right now (same planner as the server).
  const plan = useMemo(
    () =>
      planRequest(
        items.map((i) => ({ start: new Date(i.start), minutes: i.minutes, repeat: i.repeat })),
        isOpen,
        windowEnd,
        props.bufferMinutes,
      ),
    [items, isOpen, windowEnd, props.bufferMinutes],
  );
  const total = plan.sessions.reduce((sum, s) => sum + (s.repeat ? props.repeatPriceCents : props.priceCents), 0);

  // Sessions per day for the calendar: the band's own bookings + the request.
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    const push = (s: Session) => {
      const d = chicagoDateOf(s.start);
      map.set(d, [...(map.get(d) ?? []), s]);
    };
    for (const d of props.days) for (const o of d.own) push({ start: o.start, end: o.end, kind: o.state });
    for (const s of plan.sessions) {
      push({ start: s.start.toISOString(), end: s.end.toISOString(), kind: s.repeat ? 'repeat' : 'picked', item: s.item });
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [props.days, plan.sessions]);

  // A pick that's no longer open (calendar refreshed) drops out.
  useEffect(() => {
    if (plan.closed.length) setItems((list) => list.filter((_, i) => !plan.closed.includes(i)));
  }, [plan.closed]);

  function openPanel(date: string, edit: number | null, el?: HTMLElement | null) {
    setSent(null);
    // Editing a repeat opens it on its first date.
    const at = edit !== null ? chicagoDateOf(items[edit].start) : date;
    if (at.slice(0, 7) !== month) setMonth(at.slice(0, 7));
    const target = el ?? document.querySelector<HTMLElement>(`[data-day="${at}"]`);
    let pos: { top: number; left: number } | null = null;
    const wrap = calendarRef.current;
    if (target && wrap && target.offsetParent !== null) {
      const r = target.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      pos = { top: r.bottom - w.top + 6, left: Math.max(0, Math.min(r.left - w.left, w.width - 416)) };
    }
    setPanel({ date: at, edit, pos });
  }

  function savePanel(item: Item) {
    if (changing) {
      setChangePick({ start: item.start, minutes: item.minutes });
      setPanel(null);
      return;
    }
    setItems((list) => (panel?.edit != null ? list.map((x, j) => (j === panel.edit ? item : x)) : [...list, item]));
    setPanel(null);
  }

  function removeItem(index: number) {
    setItems((list) => list.filter((_, j) => j !== index));
    setPanel(null);
  }

  // Same weekday, start and length on consecutive weeks, all single picks -> offer weekly.
  const nudge = useMemo(() => {
    const singles = items.filter((i) => !i.repeat).sort((a, b) => a.start.localeCompare(b.start));
    for (const a of singles) {
      const run = [a];
      let next = new Date(a.start);
      for (;;) {
        next = new Date(occurrenceStarts(next, { freq: 'weekly', count: 2 })[1]);
        const hit = singles.find((x) => new Date(x.start).getTime() === next.getTime() && x.minutes === a.minutes);
        if (!hit) break;
        run.push(hit);
      }
      if (run.length >= 2) return run;
    }
    return null;
  }, [items]);

  // Merge the run into one weekly repeat, then open its panel so the band can
  // say how many weeks.
  function makeWeekly(run: Item[]) {
    const keep = new Set(run.map((r) => r.start));
    const rest = items.filter((x) => !keep.has(x.start));
    setItems([...rest, { start: run[0].start, minutes: run[0].minutes, repeat: { freq: 'weekly', count: Math.max(2, run.length) } }]);
    setTimeout(() => openPanel(chicagoDateOf(run[0].start), rest.length, null), 0);
  }

  function itemSummary(i: Item, index: number): string {
    const n = plan.sessions.filter((s) => s.item === index).length;
    const time = `${timeRange(i.start, endOf(i.start, i.minutes))} (${lengthLabel(i.minutes)})`;
    if (!i.repeat) return `${dayLabel(i.start)} ${time}`;
    const rule = describeRule(chicagoDateOf(i.start), i.repeat.freq);
    const ongoing = !i.repeat.until && !i.repeat.count;
    return `↻ ${rule} ${time} from ${dayLabel(i.start)} · ${n} now${ongoing ? ', ongoing' : plan.later[index] ? ` + ${plan.later[index]} later` : ''}`;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (plan.sessions.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, note, gearNeeded: gear, gearNotes, paymentMethod: method }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That didn't go through — try again.");
        if (res.status === 409) router.refresh();
        return;
      }
      const n = data.catalogueIds.length;
      const skipped: Array<{ start: string; why: string }> = data.skipped ?? [];
      const taken = skipped.filter((x) => x.why === 'unavailable').map((x) => dayLabel(x.start));
      const later: number = data.later ?? 0;
      setSent(
        `Request sent for ${n} session${n === 1 ? '' : 's'} (${data.catalogueIds.join(', ')}). ` +
          (taken.length ? `Skipped (not available): ${taken.join(', ')}. ` : '') +
          (data.ongoing
            ? 'Once approved, your repeating booking keeps going until you end it. '
            : later
              ? `${later} later date${later === 1 ? '' : 's'} will be booked automatically once approved. `
              : '') +
          `Alex will confirm by email; if there's no answer in ${props.pendingExpiryDays} days the request lapses and the time frees up.`,
      );
      setItems([]);
      setNote('');
      setReviewing(false);
      router.refresh();
      setTimeout(() => noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch {
      setError("That didn't go through — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function startChange(b: ViewBooking) {
    setSent(null);
    setPanel(null);
    setReviewing(false);
    setError(null);
    setChanging(b);
    setChangePick(null);
    setChangeNote(b.note);
    setMonth(chicagoDateOf(b.start).slice(0, 7));
    setTimeout(() => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function stopChange() {
    setChanging(null);
    setChangePick(null);
    setPanel(null);
    setError(null);
  }

  async function sendChange(e: React.FormEvent) {
    e.preventDefault();
    if (!changing || !changePick) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: changing.id, start: changePick.start, minutes: changePick.minutes, note: changeNote }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That didn't go through — try again.");
        if (res.status === 409) router.refresh();
        return;
      }
      setSent(
        `Change requested (${data.catalogueId}): ${dayLabel(changePick.start)}, ${timeRange(changePick.start, endOf(changePick.start, changePick.minutes))}. ` +
          (changing.status === 'confirmed'
            ? `Your ${dayLabel(changing.start)} booking stays yours until Alex approves — you'll get an email either way.`
            : `It replaces your earlier request. Alex will confirm by email.`),
      );
      stopChange();
      router.refresh();
      setTimeout(() => noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch {
      setError("That didn't go through — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function withdrawChange(b: ViewBooking) {
    const c = b.pendingChange;
    if (!c) return;
    if (!confirm(`Withdraw your change to ${dayLabel(c.start)}, ${timeRange(c.start, c.end)}? ${dayLabel(b.start)} stays booked.`)) return;
    setCancelling(b.id);
    setCancelError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: c.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setCancelError({ id: b.id, message: data?.error ?? "Couldn't withdraw it — try again." });
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  async function cancel(b: ViewBooking) {
    if (!confirm(`Cancel ${dayLabel(b.start)}, ${timeRange(b.start, b.end)}?`)) return;
    setCancelling(b.id);
    setCancelError(null);
    try {
      const res = await fetch(`/api/rehearsal/book/${props.token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setCancelError({ id: b.id, message: data?.error ?? "Couldn't cancel — try again." });
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  const live = props.bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed').length;
  const anyOpen = days.some((d) => d.free.length > 0);
  const panelDay = panel ? dayByDate.get(panel.date) : undefined;

  return (
    <div className={`flex w-full max-w-5xl flex-col gap-10 ${items.length || changing ? 'pb-36' : ''}`}>
      <section aria-labelledby="hello" className="text-body-3 flex flex-col gap-3 leading-normal">
        <SectionHeader id="hello" label={`Rehearsal space · ${props.bandName}`} rule="m" />
        <p className="max-w-2xl">
          Tap a day, pick a start time and how long — once or repeating — then send your request. I&apos;ll confirm by email
          with the address.
          {props.paymentsEnabled &&
            ` ${money(props.priceCents)} per session${
              props.repeatPriceCents !== props.priceCents ? `, ${money(props.repeatPriceCents)} per session when it repeats` : ''
            }.`}
        </p>
      </section>

      {/* Your bookings */}
      <section aria-labelledby="yours" className="flex flex-col gap-3">
        <SectionHeader id="yours" label="Your bookings" count={live} />
        {props.bookings.length === 0 ? (
          <p className="text-body-3 opacity-70">Nothing booked yet.</p>
        ) : (
          <ul className="divide-surface-ink/20 border-surface-ink/20 divide-y border-y">
            {props.bookings.map((b) => (
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
                <span className="ml-auto flex gap-4">
                  {b.changeFree && (
                    <button
                      type="button"
                      onClick={() => startChange(b)}
                      disabled={changing?.id === b.id}
                      className={`${FORM.link} text-body-3 disabled:opacity-40`}
                    >
                      {changing?.id === b.id ? 'Changing…' : 'Change'}
                    </button>
                  )}
                  {b.canCancel && (
                    <button
                      type="button"
                      onClick={() => cancel(b)}
                      disabled={cancelling === b.id}
                      className={`${FORM.link} text-body-3 disabled:opacity-40`}
                    >
                      {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </span>
                {b.pendingChange && (
                  <p className="basis-full">
                    <span className="opacity-70">Change requested → </span>
                    <span className="font-bold">
                      {dayLabel(b.pendingChange.start)} · {timeRange(b.pendingChange.start, b.pendingChange.end)}
                    </span>
                    <span className="opacity-70">, waiting for Alex. This one stays booked until then. </span>
                    <button
                      type="button"
                      onClick={() => withdrawChange(b)}
                      disabled={cancelling === b.id}
                      className={`${FORM.link} disabled:opacity-40`}
                    >
                      Withdraw
                    </button>
                  </p>
                )}
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
          You can edit a booking any time before it starts, but wait for confirmation to be sure -- I&apos;ll get an alert and
          will let you know asap!
        </p>
        {props.series.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-data-overline-11 font-bold tracking-[--spacing(0.625)] uppercase">Repeating</h3>
            <SeriesList
              series={props.series}
              endpoint={`/api/rehearsal/book/${props.token}/end-series`}
              cutoffHours={props.cancelCutoffHours}
              look="paper"
            />
          </div>
        )}
      </section>

      {/* Calendar */}
      <section aria-labelledby="pick" className="flex flex-col gap-4">
        <SectionHeader id="pick" label="Pick a time" />
        {sent && (
          <p ref={noticeRef} role="status" className={FORM.notice}>
            {sent}
          </p>
        )}
        {!anyOpen && props.days.every((d) => d.own.length === 0) ? (
          <p className="text-body-3 opacity-70">Nothing&apos;s open right now — check back soon.</p>
        ) : (
          <>
            <ul className="text-data-caption-13 flex flex-wrap gap-x-5 gap-y-1 opacity-80" aria-label="Key">
              <li className="flex items-center gap-1.5">
                <span className="bg-surface-ink inline-block h-1.5 w-4" />
                Open time
              </li>
              <li className="flex items-center gap-1.5">
                <span className="bg-surface-ink inline-block size-3" />
                In your request
              </li>
              <li className="flex items-center gap-1.5">
                <span className="border-surface-ink inline-block size-3 border border-dashed" />
                Requested
              </li>
              <li className="flex items-center gap-1.5">
                <span className="bg-accent-red inline-block size-3" />
                Confirmed
              </li>
            </ul>

            <div className="flex items-baseline justify-between gap-4">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={month <= firstMonth}
                className={`text-body-3 underline underline-offset-4 disabled:invisible ${FOCUS}`}
              >
                ← {monthLabel(shiftMonth(month, -1), { month: 'short' })}
              </button>
              <h3 aria-live="polite" className="text-body-2 font-bold">
                {monthLabel(month, { month: 'long', year: 'numeric' })}
              </h3>
              <button
                type="button"
                onClick={() => goMonth(1)}
                disabled={month >= lastMonth}
                className={`text-body-3 underline underline-offset-4 disabled:invisible ${FOCUS}`}
              >
                {monthLabel(shiftMonth(month, 1), { month: 'short' })} →
              </button>
            </div>

            <div ref={calendarRef} className="relative">
              <div role="grid" aria-label="Rehearsal calendar" className="border-surface-ink border-t">
                <div role="row" className="border-surface-ink grid grid-cols-7 border-b">
                  {WEEKDAYS.map((w) => (
                    <div
                      key={w}
                      role="columnheader"
                      className="text-data-overline-11 py-2 text-center font-bold tracking-[--spacing(0.625)] uppercase lg:pl-1.5 lg:text-left"
                    >
                      {w}
                    </div>
                  ))}
                </div>
                {weeks.map((week) => (
                  <div key={week[0]} role="row" className="border-surface-ink/20 grid grid-cols-7 border-b">
                    {week.map((d) => {
                      const p = dateParts(d);
                      const day = dayByDate.get(d);
                      const sessions = sessionsByDay.get(d) ?? [];
                      const open = Boolean(day?.free.length);
                      const isToday = d === props.today;
                      const inMonth = d.startsWith(month);
                      const firstOfMonth = !inMonth && (p.day === '1' || d === week[0]);
                      const openText = day?.free.map((f) => timeRange(f.start, f.end)).join(', ');
                      return (
                        <div
                          key={d}
                          role="gridcell"
                          className={`border-surface-ink/20 flex min-h-16 flex-col border-r last:border-r-0 lg:min-h-24 ${!inMonth ? 'opacity-35' : d < props.today ? 'opacity-40' : ''}`}
                        >
                          <button
                            type="button"
                            data-day={d}
                            onClick={(e) => day && open && openPanel(d, null, e.currentTarget)}
                            disabled={!open}
                            aria-haspopup="dialog"
                            aria-label={`${p.long} ${p.day} ${p.month}: ${open ? `open ${openText}` : 'nothing open'}`}
                            className={`flex w-full flex-1 flex-col gap-1 p-1 text-left disabled:cursor-default lg:p-1.5 ${
                              open ? `ui-hover:bg-surface-paper-shade cursor-pointer ${FOCUS}` : ''
                            } ${panel?.date === d ? 'outline-surface-ink outline-2 -outline-offset-2' : ''}`}
                          >
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
                            {day && open && <OpenStrip day={day} />}
                          </button>
                          {sessions.length > 0 && (
                            <div className="flex flex-col gap-0.5 px-1 pb-1 lg:px-1.5">
                              {sessions.map((s) => (
                                <SessionChip
                                  key={`${s.kind}-${s.start}`}
                                  s={s}
                                  onEdit={s.item !== undefined ? () => openPanel(d, s.item!, null) : undefined}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {panel && panelDay && (
                <PickPanel
                  key={`${panel.date}-${panel.edit}`}
                  day={panelDay}
                  changing={Boolean(changing)}
                  existing={
                    changing
                      ? chicagoDateOf(changing.start) === panel.date
                        ? {
                            start: changePick && chicagoDateOf(changePick.start) === panel.date ? changePick.start : changing.start,
                            minutes:
                              changePick && chicagoDateOf(changePick.start) === panel.date
                                ? changePick.minutes
                                : (new Date(changing.end).getTime() - new Date(changing.start).getTime()) / 60_000,
                            repeat: null,
                          }
                        : changePick && chicagoDateOf(changePick.start) === panel.date
                          ? { ...changePick, repeat: null }
                          : null
                      : panel.edit !== null
                        ? items[panel.edit]
                        : null
                  }
                  others={changing ? [] : items.filter((_, j) => j !== panel.edit)}
                  pos={panel.pos}
                  isOpen={isOpen}
                  windowEnd={windowEnd}
                  props={props}
                  onSave={savePanel}
                  onRemove={() => panel.edit !== null && removeItem(panel.edit)}
                  onClose={() => setPanel(null)}
                />
              )}
            </div>
            <p className="text-body-3 opacity-70">All times are Minneapolis time.</p>
          </>
        )}
      </section>

      {/* Changing a booking: what's being moved, pinned to the bottom */}
      {changing && !changePick && (
        <div className="bg-surface-paper border-surface-ink fixed inset-x-0 bottom-0 z-30 border-t-2">
          <div className="text-body-3 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
            <p className="min-w-0 flex-1">
              <span className="font-bold">
                Changing {dayLabel(changing.start)} · {timeRange(changing.start, changing.end)}
              </span>
              <span className="opacity-70"> — tap a day for the new time, or the same day for a different time or length.</span>
            </p>
            <span className="flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  setChangePick({
                    start: changing.start,
                    minutes: (new Date(changing.end).getTime() - new Date(changing.start).getTime()) / 60_000,
                  })
                }
                className={FORM.link}
              >
                Just edit the note
              </button>
              <button type="button" onClick={stopChange} className={FORM.secondary}>
                Keep it as is
              </button>
            </span>
          </div>
        </div>
      )}

      {/* Changing a booking: review and send */}
      {changing && changePick && (
        <>
          <div aria-hidden onClick={() => setChangePick(null)} className="bg-surface-ink/40 fixed inset-0 z-40" />
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Send your change"
            onSubmit={sendChange}
            onKeyDown={(e) => e.key === 'Escape' && setChangePick(null)}
            className="bg-surface-paper border-surface-ink text-body-3 fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col gap-5 overflow-y-auto border-t-2 p-4 pb-6 sm:p-6 lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:w-[36rem] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:border-2"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className={FORM.label}>Change {changing.catalogueId}</p>
              <button type="button" onClick={() => setChangePick(null)} className={`${FORM.link} text-data-caption-13`}>
                Back
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="opacity-70">From</dt>
              <dd>
                {dayLabel(changing.start)} · {timeRange(changing.start, changing.end)}
              </dd>
              <dt className="opacity-70">To</dt>
              <dd className="font-bold">
                {dayLabel(changePick.start)} · {timeRange(changePick.start, endOf(changePick.start, changePick.minutes))} (
                {lengthLabel(changePick.minutes)})
              </dd>
            </dl>
            <p className="opacity-70">
              {changing.status === 'confirmed'
                ? `Alex approves changes like a new request. Until then your ${dayLabel(changing.start)} booking stays yours; if the change isn't approved, nothing moves.`
                : 'This replaces your request — Alex will confirm the new time by email.'}
            </p>
            <div>
              <label htmlFor="change-note" className={FORM.label}>
                Note to Alex (optional)
              </label>
              <textarea
                id="change-note"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Why the change, or anything else I should know"
                className={FORM.field}
              />
            </div>
            {error && (
              <p role="alert" className={FORM.error}>
                {error}
              </p>
            )}
            <button type="submit" disabled={sending} className={FORM.primary}>
              {sending ? 'Sending…' : 'Send change request'}
            </button>
          </form>
        </>
      )}

      {/* The request bar, pinned to the bottom of the screen */}
      {items.length > 0 && !reviewing && !changing && (
        <div className="bg-surface-paper border-surface-ink fixed inset-x-0 bottom-0 z-30 border-t-2">
          <div className="text-body-3 mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:px-8">
            {nudge && (
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span>
                  {`${dateParts(chicagoDateOf(nudge[0].start)).long}s ${timeRange(nudge[0].start, endOf(nudge[0].start, nudge[0].minutes))}, ${nudge.length} weeks in a row — make it every week?`}
                </span>
                <button type="button" onClick={() => makeWeekly(nudge)} className={FORM.link}>
                  Make it weekly
                </button>
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <p className="min-w-0 flex-1">
                <span className="font-bold">Your request</span>
                {' · '}
                {items.map((i, n) => itemSummary(i, n)).join(' · ')}
                {' · '}
                <span className="font-bold">
                  {plan.sessions.length} session{plan.sessions.length === 1 ? '' : 's'}
                  {props.paymentsEnabled && ` · ${money(total)}`}
                </span>
              </p>
              <button type="button" onClick={() => setReviewing(true)} className={`${FORM.primary} w-auto`}>
                Review and send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review and send */}
      {reviewing && (
        <>
          <div aria-hidden onClick={() => setReviewing(false)} className="bg-surface-ink/40 fixed inset-0 z-40" />
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Review and send your request"
            onSubmit={send}
            onKeyDown={(e) => e.key === 'Escape' && setReviewing(false)}
            className="bg-surface-paper border-surface-ink text-body-3 fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col gap-5 overflow-y-auto border-t-2 p-4 pb-6 sm:p-6 lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:w-[36rem] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:border-2"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className={FORM.label}>
                Your request · {plan.sessions.length} session{plan.sessions.length === 1 ? '' : 's'}
                {props.paymentsEnabled && ` · ${money(total)}`}
              </p>
              <button type="button" onClick={() => setReviewing(false)} className={`${FORM.link} text-data-caption-13`}>
                Back
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {items.map((i, n) => {
                const dates = plan.sessions.filter((s) => s.item === n);
                const skipped = plan.skipped.filter((s) => s.item === n);
                return (
                  <li key={i.start} className="border-surface-ink/20 flex flex-col gap-1 border-b pb-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-bold">{itemSummary(i, n)}</span>
                      <span className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewing(false);
                            setTimeout(() => openPanel(chicagoDateOf(i.start), n, null), 0);
                          }}
                          className={FORM.link}
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => removeItem(n)} className={FORM.link}>
                          Remove
                        </button>
                      </span>
                    </span>
                    {i.repeat && (
                      <span className="text-data-caption-13 opacity-70">
                        {dates.map((d) => dayLabel(d.start.toISOString())).join(', ')}
                        {skipped.length ? ` · skipped: ${skipped.map((s) => dayLabel(s.start.toISOString())).join(', ')}` : ''}
                      </span>
                    )}
                    {props.rates && !props.paymentsEnabled && (
                      <span className="text-data-caption-13 opacity-70">
                        {estimateLine(i.minutes, i.repeat?.freq ?? null, props.rates)}
                        {SOFT}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {SHOW_GEAR && props.gearOptions.length > 0 && (
              <fieldset>
                <legend className={FORM.label}>Gear you&apos;ll need (optional)</legend>
                <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
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
            {SHOW_GEAR && (
              <div>
                <label htmlFor="gear-notes" className={FORM.label}>
                  Gear notes (optional)
                </label>
                <input
                  id="gear-notes"
                  value={gearNotes}
                  onChange={(e) => setGearNotes(e.target.value)}
                  maxLength={500}
                  placeholder="2 vocal mics; bringing our own kit, just need the throne"
                  className={FORM.field}
                />
              </div>
            )}
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
                placeholder="Anything I should know? Gear you'll need?"
                className={FORM.field}
              />
            </div>
            {!props.paymentsEnabled ? null : props.paymentMethods.length > 1 ? (
              <fieldset>
                <legend className={FORM.label}>How you&apos;ll pay</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
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
              <p className="opacity-70">You&apos;ll pay by Venmo once Alex confirms.</p>
            )}
            {error && (
              <p role="alert" className={FORM.error}>
                {error}
              </p>
            )}
            <button type="submit" disabled={sending || plan.sessions.length === 0} className={FORM.primary}>
              {sending ? 'Sending…' : `Send request · ${plan.sessions.length} session${plan.sessions.length === 1 ? '' : 's'}`}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
