'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';

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
}

export interface BookingViewProps {
  token: string;
  bandName: string;
  contactEmail: string;
  firstMonday: string;
  blocks: ViewBlock[];
  bookings: ViewBooking[];
  priceCents: number;
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

// --- main -------------------------------------------------------------------

export default function BookingView(props: BookingViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [gear, setGear] = useState<string[]>(props.defaultGearNeeded);
  const [gearNotes, setGearNotes] = useState(props.defaultGearNotes);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(props.paymentMethods[0] ?? 'venmo');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<{ id: number; message: string } | null>(null);

  // Weeks from the Monday of this week through the last block.
  const weeks = useMemo(() => {
    const last = props.blocks.length ? props.blocks[props.blocks.length - 1].date : props.firstMonday;
    const out: Array<{ monday: string; days: string[]; open: number }> = [];
    for (let m = props.firstMonday; m <= last; m = addDays(m, 7)) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(m, i));
      const open = props.blocks.filter((b) => b.state === 'open' && b.date >= m && b.date <= days[6]).length;
      out.push({ monday: m, days, open });
    }
    return out;
  }, [props.blocks, props.firstMonday]);
  const [weekIndex, setWeekIndex] = useState(() => {
    const i = weeks.findIndex((w) => w.open > 0);
    return i < 0 ? 0 : i;
  });
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];

  const blocksByDay = useMemo(() => {
    const map = new Map<string, ViewBlock[]>();
    for (const b of props.blocks) map.set(b.date, [...(map.get(b.date) ?? []), b]);
    return map;
  }, [props.blocks]);

  // Only blocks still open count (a refresh may have taken one).
  const picked = props.blocks.filter((b) => b.state === 'open' && selected.includes(b.start));

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
      setSent(
        `Request sent for ${picked.length} block${picked.length === 1 ? '' : 's'} (${data.catalogueIds.join(', ')}). ` +
          `Alex will confirm by email; if there's no answer in ${props.pendingExpiryDays} days the request lapses and the time frees up.`,
      );
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

      {/* Week view */}
      <section aria-labelledby="pick" className="flex flex-col gap-4">
        <SectionHeader id="pick" label="Pick blocks" />
        {weeks.length === 0 || props.blocks.length === 0 ? (
          <p className="text-body-3 opacity-70">No blocks are on the calendar right now — check back soon.</p>
        ) : (
          <>
            <nav aria-label="Weeks" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {weeks.map((w, i) => {
                const p = dateParts(w.monday);
                const active = i === weekIndex;
                return (
                  <button
                    key={w.monday}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setWeekIndex(i)}
                    className={`text-data-caption-13 shrink-0 cursor-pointer border px-3 py-2 text-left focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      active ? 'bg-surface-ink text-surface-paper border-surface-ink' : 'border-surface-ink/40 ui-hover:border-surface-ink'
                    }`}
                  >
                    <span className="block font-bold uppercase">
                      {p.day} {p.month}
                    </span>
                    <span className="block opacity-70">{w.open ? `${w.open} open` : 'full'}</span>
                  </button>
                );
              })}
            </nav>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
              {week.days.map((d) => {
                const p = dateParts(d);
                const list = blocksByDay.get(d) ?? [];
                return (
                  <div key={d} className="flex flex-col gap-2">
                    <h3 className="text-data-overline-11 border-surface-ink border-b pb-1 font-bold tracking-[--spacing(0.625)] uppercase">
                      {p.weekday} {p.day} {p.month}
                    </h3>
                    {list.length === 0 ? (
                      <p className="text-data-caption-13 opacity-40">—</p>
                    ) : (
                      list.map((b) => (
                        <BlockCell key={b.start} block={b} selected={selected.includes(b.start)} onToggle={() => toggle(b.start)} />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
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
                {picked.length} block{picked.length === 1 ? '' : 's'} · {money(props.priceCents * picked.length)}
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
            <button type="submit" disabled={sending} className={FORM.primary}>
              {sending ? 'Sending…' : `Request ${picked.length} block${picked.length === 1 ? '' : 's'}`}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
