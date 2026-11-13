'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import { describeRule, occurrenceStarts, type Freq, type SeriesRule } from '@/lib/rehearsal/series';
import { planRequest } from '@/lib/rehearsal/request-rules';
import SeriesList, { type SeriesView } from './SeriesList';

// The band's private booking page. Their bookings, then a calendar of blocks
// (Open / Requested / Confirmed / Unavailable — never why). Clicking an open
// block opens a small panel right there (a sheet on phones): just this date,
// or repeat it. Picks collect in a bar pinned to the bottom of the screen;
// "Review and send" takes gear, a note and payment. If a band picks the same
// slot on consecutive weeks, the bar offers to make it a weekly repeat.
// 2027 tokens only.

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
  paymentsEnabled: boolean; // off = no prices or payment choice anywhere on the page
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
  series: SeriesView[];
}

// One pick: a single block, or a block that repeats.
interface Item {
  start: string; // ISO
  repeat: SeriesRule | null;
}

const TZ = 'America/Chicago';
const METHOD_LABEL: Record<PaymentMethod, string> = { venmo: 'Venmo', square: 'Card', cash: 'Cash' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FOCUS = 'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';

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

function chicagoDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
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

const STATE_WORD: Record<State, string> = {
  open: 'open',
  requested: 'requested, waiting for Alex',
  confirmed: 'confirmed, yours',
  unavailable: 'unavailable',
};

// --- calendar cells -----------------------------------------------------------

// A block inside a desktop calendar cell. `picked` = in the request (↻ when
// it's one of a repeat's dates).
function Chip({
  block,
  picked,
  onPick,
}: {
  block: ViewBlock;
  picked: 'no' | 'once' | 'repeat';
  onPick: (el: HTMLElement) => void;
}) {
  const label = timeRange(block.start, block.end);
  const base = 'text-data-caption-13 block w-full border px-1.5 py-1 text-left leading-tight';
  if (block.state === 'open') {
    return (
      <button
        type="button"
        data-start={block.start}
        aria-haspopup="dialog"
        aria-label={`${dayLabel(block.start)} ${label}, ${picked === 'no' ? 'open' : 'in your request'}`}
        onClick={(e) => onPick(e.currentTarget)}
        className={`${base} cursor-pointer font-bold ${FOCUS} ${
          picked !== 'no' ? 'bg-surface-ink text-surface-paper border-surface-ink' : 'border-surface-ink ui-hover:bg-surface-paper-shade'
        }`}
      >
        {picked === 'repeat' && <span aria-hidden>↻ </span>}
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
    <span aria-label={`${dayLabel(block.start)} ${label}, ${STATE_WORD[block.state]}`} className={`${base} ${look}`}>
      {label}
    </span>
  );
}

// A block on the phone calendar: a small square, state by style.
function Mark({ block, picked }: { block: ViewBlock; picked: boolean }) {
  const look = picked
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

// A block in the phone's day list, full width.
function DayBlock({ block, picked, onPick }: { block: ViewBlock; picked: boolean; onPick: () => void }) {
  const label = timeRange(block.start, block.end);
  const base = 'text-data-caption-13 flex w-full items-center justify-between gap-2 border px-2 py-3 text-left';
  if (block.state === 'open') {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onPick}
        className={`${base} cursor-pointer ${FOCUS} ${
          picked ? 'bg-surface-ink text-surface-paper border-surface-ink' : 'border-surface-ink ui-hover:bg-surface-paper-shade'
        }`}
      >
        <span className="font-bold">{label}</span>
        <span className="text-data-label-10-small uppercase">{picked ? 'In your request' : 'Open — tap to book'}</span>
      </button>
    );
  }
  const word = block.state === 'requested' ? 'Requested' : block.state === 'confirmed' ? 'Yours' : 'Unavailable';
  const look =
    block.state === 'requested'
      ? 'border-surface-ink border-dashed'
      : block.state === 'confirmed'
        ? 'bg-accent-red text-surface-paper border-accent-red'
        : 'border-surface-ink/20 text-surface-ink/40';
  return (
    <div className={`${base} ${look}`}>
      <span className={block.state === 'unavailable' ? 'line-through decoration-1' : 'font-bold'}>{label}</span>
      <span className="text-data-label-10-small uppercase">{word}</span>
    </div>
  );
}

// --- the pick panel ---------------------------------------------------------------

type Choice = 'once' | Freq;

function PickPanel({
  block,
  existing,
  pos,
  openSet,
  windowEnd,
  priceCents,
  repeatPriceCents,
  paymentsEnabled,
  onSave,
  onRemove,
  onClose,
}: {
  block: ViewBlock;
  existing: Item | null;
  pos: { top: number; left: number } | null; // desktop anchor inside the calendar
  openSet: Set<number>;
  windowEnd: Date;
  priceCents: number;
  repeatPriceCents: number;
  paymentsEnabled: boolean;
  onSave: (item: Item) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Choice>(existing?.repeat?.freq ?? 'once');
  const [endBy, setEndBy] = useState<'count' | 'until' | 'ongoing'>(
    existing?.repeat ? (existing.repeat.until ? 'until' : existing.repeat.count ? 'count' : 'ongoing') : 'count',
  );
  const [count, setCount] = useState(existing?.repeat?.count ?? 6);
  const [until, setUntil] = useState(existing?.repeat?.until ?? '');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rule: SeriesRule | null =
    choice === 'once'
      ? null
      : endBy === 'ongoing'
        ? { freq: choice }
        : endBy === 'count'
          ? { freq: choice, count }
          : until
            ? { freq: choice, until }
            : null;
  const all = rule
    ? occurrenceStarts(new Date(block.start), rule).map((d) => ({
        d,
        state: openSet.has(d.getTime()) ? 'open' : d >= windowEnd ? 'later' : 'unavailable',
      }))
    : [];
  // Dates inside the booking window are listed; later ones are booked
  // automatically once Alex approves, as they come into range.
  const preview = all.filter((p) => p.state !== 'later');
  const later = all.length - preview.length;
  const open = preview.filter((p) => p.state === 'open').length;
  const date = block.date;
  const label = `${dayLabel(block.start)} · ${timeRange(block.start, block.end)}`;

  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  const options: Array<[Choice, string]> = [
    ['once', 'Just this date'],
    ['weekly', `Every ${weekday}`],
    ['biweekly', `Every other ${weekday}`],
    ['monthly_nth', describeRule(date, 'monthly_nth').replace(/^Monthly on the/, 'Monthly, the')],
  ];

  return (
    <>
      {/* Backdrop: dims on phones, invisible on desktop; a click outside closes. */}
      <div aria-hidden onClick={onClose} className="bg-surface-ink/40 fixed inset-0 z-40 lg:bg-transparent" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${label}`}
        style={pos ? ({ '--px': `${pos.left}px`, '--py': `${pos.top}px` } as React.CSSProperties) : undefined}
        className={`bg-surface-paper border-surface-ink text-body-3 fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-4 overflow-y-auto border-t-2 p-4 pb-6 lg:inset-x-auto lg:bottom-auto lg:max-h-none lg:w-[24rem] lg:border-2 ${
          pos ? 'lg:absolute lg:top-(--py) lg:left-(--px)' : 'lg:top-1/4 lg:left-1/2 lg:-translate-x-1/2'
        }`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-bold">{label}</p>
          <button type="button" onClick={onClose} aria-label="Close" className={`${FORM.link} text-data-caption-13`}>
            Close
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Once or repeating</legend>
          {options.map(([value, text], i) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                ref={i === 0 ? first : undefined}
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
                min={date}
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
            {preview.length > 0 && (
              <ul className="text-data-caption-13 flex max-h-40 flex-col gap-0.5 overflow-y-auto" aria-label="Dates">
                {preview.map((p) => (
                  <li key={p.d.getTime()} className={`flex justify-between gap-4 ${p.state === 'open' ? '' : 'opacity-50'}`}>
                    <span className={p.state === 'open' ? '' : 'line-through decoration-1'}>{dayLabel(p.d.toISOString())}</span>
                    <span className="uppercase">{p.state === 'open' ? 'Open' : 'Unavailable'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="opacity-70">
          {choice === 'once'
            ? paymentsEnabled
              ? money(priceCents)
              : 'Just this one.'
            : rule
              ? `${open} session${open === 1 ? '' : 's'} now${paymentsEnabled ? ` · ${money(open * repeatPriceCents)}` : ''}${
                  open < preview.length ? ' — dates that aren’t open are skipped' : ''
                }. ${
                  endBy === 'ongoing'
                    ? 'After that it keeps going, booked automatically once Alex approves, until you end it.'
                    : later
                      ? `${later} more ${later === 1 ? 'is' : 'are'} booked automatically as ${later === 1 ? 'it comes' : 'they come'} into the booking window, once Alex approves.`
                      : ''
                }`
              : 'Pick an end date.'}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {existing && (
            <button type="button" onClick={onRemove} className={`${FORM.link} mr-auto`}>
              Remove
            </button>
          )}
          <button
            type="button"
            disabled={choice !== 'once' && (!rule || open === 0)}
            onClick={() => onSave({ start: block.start, repeat: rule })}
            className={`${FORM.primary} w-auto`}
          >
            {existing ? 'Update' : 'Add to request'}
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
  const [panel, setPanel] = useState<{ block: ViewBlock; pos: { top: number; left: number } | null } | null>(null);
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
  const [openDay, setOpenDay] = useState<string | null>(
    () => props.blocks.find((b) => b.state === 'open')?.date ?? null,
  );

  const windowEnd = useMemo(() => new Date(props.windowEnd), [props.windowEnd]);
  const openSet = useMemo(
    () => new Set(props.blocks.filter((b) => b.state === 'open').map((b) => new Date(b.start).getTime())),
    [props.blocks],
  );
  const blockByStart = useMemo(() => new Map(props.blocks.map((b) => [new Date(b.start).getTime(), b])), [props.blocks]);

  // Calendar rows: Monday-start weeks from this week through the last block.
  const weeks = useMemo(() => {
    const last = props.blocks.length ? props.blocks[props.blocks.length - 1].date : props.firstMonday;
    const out: string[][] = [];
    for (let m = props.firstMonday; m <= last; m = addDays(m, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(m, i)));
    return out;
  }, [props.blocks, props.firstMonday]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, ViewBlock[]>();
    for (const b of props.blocks) map.set(b.date, [...(map.get(b.date) ?? []), b]);
    return map;
  }, [props.blocks]);

  // What the request books right now (same planner as the server).
  const plan = useMemo(
    () =>
      planRequest(
        items.map((i) => ({ start: new Date(i.start), repeat: i.repeat })),
        (d) => openSet.has(d.getTime()),
        windowEnd,
      ),
    [items, openSet, windowEnd],
  );
  const pickedAt = useMemo(() => {
    const m = new Map<number, { item: number; repeat: boolean }>();
    for (const s of plan.sessions) m.set(s.start.getTime(), { item: s.item, repeat: s.repeat });
    return m;
  }, [plan]);
  const total = plan.sessions.reduce((sum, s) => sum + (s.repeat ? props.repeatPriceCents : props.priceCents), 0);

  // A pick that's no longer open (calendar refreshed) drops out.
  useEffect(() => {
    if (plan.closed.length) setItems((list) => list.filter((_, i) => !plan.closed.includes(i)));
  }, [plan.closed]);

  function itemIndexFor(start: string): number {
    const t = new Date(start).getTime();
    const own = items.findIndex((i) => new Date(i.start).getTime() === t);
    if (own >= 0) return own;
    return pickedAt.get(t)?.item ?? -1;
  }

  function openPanel(block: ViewBlock, el?: HTMLElement | null) {
    setSent(null);
    // Clicking a date that belongs to a repeat edits that repeat (its first date).
    const idx = itemIndexFor(block.start);
    const anchor = idx >= 0 ? (blockByStart.get(new Date(items[idx].start).getTime()) ?? block) : block;
    // Anchor the panel where they clicked (else at the pick's first date).
    const target = el ?? document.querySelector<HTMLElement>(`[data-start="${anchor.start}"]`);
    let pos: { top: number; left: number } | null = null;
    const wrap = calendarRef.current;
    if (target && wrap && target.offsetParent !== null) {
      const r = target.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      pos = { top: r.bottom - w.top + 6, left: Math.max(0, Math.min(r.left - w.left, w.width - 384)) };
    }
    setPanel({ block: anchor, pos });
  }

  function savePanel(item: Item) {
    setItems((list) => {
      const i = list.findIndex((x) => x.start === item.start);
      return i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item];
    });
    setPanel(null);
  }

  function removeItem(start: string) {
    setItems((list) => list.filter((x) => x.start !== start));
    setPanel(null);
  }

  // Same weekday and time on consecutive weeks, all single picks -> offer weekly.
  const nudge = useMemo(() => {
    const singles = items.filter((i) => !i.repeat).sort((a, b) => a.start.localeCompare(b.start));
    for (const a of singles) {
      const run = [a];
      let next = new Date(a.start);
      for (;;) {
        next = new Date(occurrenceStarts(next, { freq: 'weekly', count: 2 })[1]);
        const hit = singles.find((x) => new Date(x.start).getTime() === next.getTime());
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
    setItems((list) => [
      ...list.filter((x) => !keep.has(x.start)),
      { start: run[0].start, repeat: { freq: 'weekly', count: Math.max(2, run.length) } },
    ]);
    const b = blockByStart.get(new Date(run[0].start).getTime());
    if (b) setTimeout(() => openPanel(b, null), 0);
  }

  function itemSummary(i: Item, index: number): string {
    const n = plan.sessions.filter((s) => s.item === index).length;
    const b = blockByStart.get(new Date(i.start).getTime());
    const time = b ? timeRange(b.start, b.end) : '';
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
        setError(data?.error ?? 'That didn’t go through — try again.');
        if (res.status === 409) router.refresh();
        return;
      }
      const n = data.catalogueIds.length;
      const skipped: Array<{ start: string; why: string }> = data.skipped ?? [];
      const list = (why: string) => skipped.filter((x) => x.why === why).map((x) => dayLabel(x.start));
      const taken = list('unavailable');
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
      setError('That didn’t go through — check your connection and try again.');
    } finally {
      setSending(false);
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
      if (!res.ok) setCancelError({ id: b.id, message: data?.error ?? 'Couldn’t cancel — try again.' });
      router.refresh();
    } finally {
      setCancelling(null);
    }
  }

  const hours = props.blockMinutes % 60 === 0 ? `${props.blockMinutes / 60}-hour` : `${props.blockMinutes}-minute`;
  const live = props.bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed').length;

  return (
    <div className={`flex w-full max-w-5xl flex-col gap-10 ${items.length ? 'pb-36' : ''}`}>
      <section aria-labelledby="hello" className="text-body-3 flex flex-col gap-3 leading-normal">
        <SectionHeader id="hello" label={`Rehearsal space · ${props.bandName}`} rule="m" />
        <p className="max-w-2xl">
          Tap an open {hours} block to book it once or make it repeat, then send your request. I&apos;ll confirm by email
          with the address.
          {props.paymentsEnabled &&
            ` ${money(props.priceCents)} per block${
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
        <p className="text-body-3 opacity-70">You can cancel here up to {props.cancelCutoffHours} hours before a session.</p>
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
        <SectionHeader id="pick" label="Pick blocks" />
        {sent && (
          <p ref={noticeRef} role="status" className={FORM.notice}>
            {sent}
          </p>
        )}
        {props.blocks.length === 0 ? (
          <p className="text-body-3 opacity-70">No blocks are on the calendar right now — check back soon.</p>
        ) : (
          <>
            <ul className="text-data-caption-13 flex flex-wrap gap-x-5 gap-y-1 opacity-80" aria-label="Key">
              <li className="flex items-center gap-1.5">
                <span className="border-surface-ink inline-block size-3 border" />
                Open
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
              <li className="flex items-center gap-1.5">
                <span className="border-surface-ink/20 inline-block size-3 border" />
                Unavailable
              </li>
            </ul>

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
                {weeks.map((days) => (
                  <div key={days[0]} role="row" className="border-surface-ink/20 grid grid-cols-7 border-b">
                    {days.map((d) => {
                      const p = dateParts(d);
                      const list = blocksByDay.get(d) ?? [];
                      const isToday = d === props.today;
                      const firstOfMonth = p.day === '1' || d === props.firstMonday;
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
                            d < props.today ? 'opacity-40' : ''
                          }`}
                        >
                          {/* Phone: the cell picks the day; its blocks list below the calendar. */}
                          <button
                            type="button"
                            onClick={() => setOpenDay(d)}
                            disabled={list.length === 0}
                            aria-label={`${p.weekday} ${p.day} ${p.month}: ${list.filter((b) => b.state === 'open').length} open`}
                            aria-pressed={openDay === d}
                            className={`flex h-full w-full flex-col items-center gap-1 disabled:cursor-default lg:hidden ${
                              openDay === d ? 'outline-surface-ink outline-2 -outline-offset-2' : ''
                            }`}
                          >
                            {dateLabel}
                            <span className="flex flex-wrap justify-center gap-0.5">
                              {list.map((b) => (
                                <Mark key={b.start} block={b} picked={pickedAt.has(new Date(b.start).getTime())} />
                              ))}
                            </span>
                          </button>
                          {/* Desktop: blocks right in the cell. */}
                          <div className="hidden flex-col gap-1 lg:flex">
                            {dateLabel}
                            {list.map((b) => {
                              const at = pickedAt.get(new Date(b.start).getTime());
                              return (
                                <Chip
                                  key={b.start}
                                  block={b}
                                  picked={at ? (at.repeat ? 'repeat' : 'once') : 'no'}
                                  onPick={(el) => openPanel(b, el)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {panel && (
                <PickPanel
                  key={panel.block.start}
                  block={panel.block}
                  existing={items.find((i) => i.start === panel.block.start) ?? null}
                  pos={panel.pos}
                  openSet={openSet}
                  windowEnd={windowEnd}
                  priceCents={props.priceCents}
                  paymentsEnabled={props.paymentsEnabled}
                  repeatPriceCents={props.repeatPriceCents}
                  onSave={savePanel}
                  onRemove={() => removeItem(panel.block.start)}
                  onClose={() => setPanel(null)}
                />
              )}
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
                  <DayBlock
                    key={b.start}
                    block={b}
                    picked={pickedAt.has(new Date(b.start).getTime())}
                    onPick={() => openPanel(b, null)}
                  />
                ))}
              </div>
            )}
            <p className="text-body-3 opacity-70">All times are Minneapolis time.</p>
          </>
        )}
      </section>

      {/* The request bar, pinned to the bottom of the screen */}
      {items.length > 0 && !reviewing && (
        <div className="bg-surface-paper border-surface-ink fixed inset-x-0 bottom-0 z-30 border-t-2">
          <div className="text-body-3 mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:px-8">
            {nudge && (
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span>
                  {(() => {
                    const b = blockByStart.get(new Date(nudge[0].start).getTime());
                    const [y, m, d] = chicagoDateOf(nudge[0].start).split('-').map(Number);
                    const wd = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
                    return `${wd}s ${b ? timeRange(b.start, b.end) : ''}, ${nudge.length} weeks in a row — make it every week?`;
                  })()}
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
                            const b = blockByStart.get(new Date(i.start).getTime());
                            if (b) setTimeout(() => openPanel(b, null), 0);
                          }}
                          className={FORM.link}
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => removeItem(i.start)} className={FORM.link}>
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
                  </li>
                );
              })}
            </ul>

            {props.gearOptions.length > 0 && (
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
            <div>
              <label htmlFor="note" className={FORM.label}>
                Note to Alex (optional)
              </label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className={FORM.field} />
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
