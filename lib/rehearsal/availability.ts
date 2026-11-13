// Rehearsal availability engine. PURE: no DB, no network, no clock. Callers
// pass in everything (lib/rehearsal/availability-data.ts loads the real data),
// so it runs under `npm test` with fake shows / bookings / busy times.
//
// Availability is open by default. Every standing-hours block starts open,
// then loses it to, in order of the reasons below:
//   past / window  — before now + window_min_hours, or after now + window_max_weeks
//   show           — a day with a (non-cancelled, non-postponed) show
//   unavailable_day— a day marked Not available in Booking (booking_days)
//   blackout       — a manual rehearsal blackout
//   busy           — a busy time from the private .ics feeds
//   booked         — a pending (not yet expired) or confirmed booking
// A band's own pending/confirmed booking shows as requested/confirmed instead.
// What a band sees never says why a block is unavailable (forBand()).
//
// Imports use the .ts extension so `node --test` can load this file directly.

import { wallTimeToUtc } from '../local-time.ts';

export const TIME_ZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type ShowDayRule = 'whole_day' | 'from_time';

export interface EngineSettings {
  blockMinutes: number;
  windowMinHours: number;
  windowMaxWeeks: number;
  showDayRule: ShowDayRule;
  showDayFrom: string; // "HH:MM"
}

export interface Interval {
  start: Date;
  end: Date;
}

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'expired';

export interface EngineBooking {
  id: number;
  bandId: number;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  expiresAt: Date;
}

export interface BusyTimes {
  intervals: Interval[];
  // false when any feed couldn't be read: blocks stay open, and the request
  // carries a "couldn't check calendar" flag for the approval email.
  checked: boolean;
}

export interface EngineInput {
  now: Date;
  settings: EngineSettings;
  hours: Array<{ weekday: number; startTime: string }>;
  showDates: string[]; // "YYYY-MM-DD" (Chicago)
  unavailableDays: string[]; // "YYYY-MM-DD"
  blackouts: Interval[];
  busy: BusyTimes;
  bookings: EngineBooking[];
  // The band looking (its own bookings show as requested/confirmed). Omit for admin.
  viewerBandId?: number;
  // First Chicago date to lay out (default: today). Blocks before the window
  // are still returned, as unavailable, so a week view has no holes.
  fromDate?: string;
}

export type Reason = 'past' | 'window' | 'show' | 'unavailable_day' | 'blackout' | 'busy' | 'booked';

export type BlockState = 'open' | 'requested' | 'confirmed' | 'unavailable';

export interface Block {
  date: string; // Chicago date the block starts on
  startTime: string; // "HH:MM" Chicago
  start: Date;
  end: Date;
  state: BlockState;
  bookingId?: number; // the viewer's own booking, when requested/confirmed
  reasons: Reason[]; // admin-only; empty when open
}

export interface Availability {
  blocks: Block[];
  calendarChecked: boolean;
  windowStart: Date;
  windowEnd: Date;
}

// --- Chicago calendar helpers ------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Instant -> "YYYY-MM-DD" in Chicago.
export function chicagoDate(instant: Date): string {
  return dateFmt.format(instant);
}

// Instant -> "HH:MM" in Chicago.
export function chicagoTime(instant: Date): string {
  return timeFmt.format(instant);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 0 = Sunday … 6 = Saturday, for a calendar date (no time zone involved).
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function hm(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number);
  return [h, m];
}

// Chicago midnight starting `date`, as an instant.
export function startOfChicagoDay(date: string): Date {
  return wallTimeToUtc(date, 0, 0, TIME_ZONE);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

// --- the window --------------------------------------------------------------

export function bookingWindow(now: Date, s: EngineSettings): Interval {
  return {
    start: new Date(now.getTime() + s.windowMinHours * HOUR_MS),
    end: new Date(now.getTime() + s.windowMaxWeeks * 7 * DAY_MS),
  };
}

// --- hard constraints (shared with conflict detection) -----------------------

export interface Constraints {
  settings: EngineSettings;
  showDates: string[];
  unavailableDays: string[];
  blackouts: Interval[];
  busy: Interval[];
}

// The span a show day blocks: the whole Chicago day, or from show_day_from to
// the end of the day. Block overlap (not start date) decides, so a late block
// the night before that runs past midnight into a show day is blocked too.
export function showDayInterval(date: string, s: EngineSettings): Interval {
  const end = startOfChicagoDay(addDays(date, 1));
  if (s.showDayRule === 'from_time') {
    const [h, m] = hm(s.showDayFrom);
    return { start: wallTimeToUtc(date, h, m, TIME_ZONE), end };
  }
  return { start: startOfChicagoDay(date), end };
}

function wholeDay(date: string): Interval {
  return { start: startOfChicagoDay(date), end: startOfChicagoDay(addDays(date, 1)) };
}

// The days an interval touches (by Chicago date), for day-based lookups.
function datesTouched(iv: Interval): string[] {
  const out: string[] = [];
  let d = addDays(chicagoDate(iv.start), -1); // a from_time rule never reaches back, but be safe
  const last = chicagoDate(new Date(iv.end.getTime() - 1));
  while (d <= last) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// Why an interval can't be used, ignoring bookings and the window. Empty = clear.
export function constraintReasons(iv: Interval, c: Constraints): Reason[] {
  const reasons: Reason[] = [];
  const days = datesTouched(iv);
  const shows = new Set(c.showDates);
  const away = new Set(c.unavailableDays);
  if (days.some((d) => shows.has(d) && overlaps(iv, showDayInterval(d, c.settings)))) reasons.push('show');
  if (days.some((d) => away.has(d) && overlaps(iv, wholeDay(d)))) reasons.push('unavailable_day');
  if (c.blackouts.some((b) => overlaps(iv, b))) reasons.push('blackout');
  if (c.busy.some((b) => overlaps(iv, b))) reasons.push('busy');
  return reasons;
}

// A booking holds its time while pending (until it expires) or confirmed.
// Expiry is judged here, on read, so no cron has to run for a block to free up.
export function holdsTime(b: EngineBooking, now: Date): boolean {
  if (b.status === 'confirmed') return true;
  return b.status === 'pending' && b.expiresAt.getTime() > now.getTime();
}

// --- block layout ------------------------------------------------------------

// Every standing-hours block from `fromDate` through the window's last day.
export function layoutBlocks(
  fromDate: string,
  toDate: string,
  hours: EngineInput['hours'],
  blockMinutes: number,
): Array<{ date: string; startTime: string; start: Date; end: Date }> {
  const byDay = new Map<number, string[]>();
  for (const h of hours) {
    const list = byDay.get(h.weekday) ?? [];
    list.push(h.startTime);
    byDay.set(h.weekday, list);
  }
  const out: Array<{ date: string; startTime: string; start: Date; end: Date }> = [];
  const seen = new Set<number>();
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    for (const startTime of (byDay.get(weekdayOf(d)) ?? []).slice().sort()) {
      const [h, m] = hm(startTime);
      const start = wallTimeToUtc(d, h, m, TIME_ZONE);
      // A start time that doesn't exist (spring-forward gap) lands on another
      // wall time; skip it rather than offer a block nobody asked for.
      if (chicagoTime(start) !== startTime || seen.has(start.getTime())) continue;
      seen.add(start.getTime());
      out.push({ date: d, startTime, start, end: new Date(start.getTime() + blockMinutes * 60_000) });
    }
  }
  return out;
}

export function computeAvailability(input: EngineInput): Availability {
  const { now, settings } = input;
  const window = bookingWindow(now, settings);
  const fromDate = input.fromDate ?? chicagoDate(now);
  const toDate = chicagoDate(window.end);

  const constraints: Constraints = {
    settings,
    showDates: input.showDates,
    unavailableDays: input.unavailableDays,
    blackouts: input.blackouts,
    busy: input.busy.intervals,
  };
  const holding = input.bookings.filter((b) => holdsTime(b, now));
  const own = input.viewerBandId === undefined ? [] : holding.filter((b) => b.bandId === input.viewerBandId);

  const blocks: Block[] = [];
  const shownOwn = new Set<number>();

  for (const slot of layoutBlocks(fromDate, toDate, input.hours, settings.blockMinutes)) {
    const iv = { start: slot.start, end: slot.end };

    // The viewer's own booking wins: they always see what they asked for.
    const mine = own.find((b) => overlaps(iv, { start: b.startsAt, end: b.endsAt }));
    if (mine) {
      shownOwn.add(mine.id);
      blocks.push({
        ...slot,
        state: mine.status === 'confirmed' ? 'confirmed' : 'requested',
        bookingId: mine.id,
        reasons: [],
      });
      continue;
    }

    const reasons: Reason[] = [];
    if (slot.start.getTime() < now.getTime()) reasons.push('past');
    else if (slot.start.getTime() < window.start.getTime() || slot.start.getTime() >= window.end.getTime()) {
      reasons.push('window');
    }
    reasons.push(...constraintReasons(iv, constraints));
    if (holding.some((b) => overlaps(iv, { start: b.startsAt, end: b.endsAt }))) reasons.push('booked');

    blocks.push({ ...slot, state: reasons.length ? 'unavailable' : 'open', reasons });
  }

  // Own bookings that no longer line up with a standing block (hours or block
  // length changed since) still appear, so nothing a band booked goes missing.
  for (const b of own) {
    if (shownOwn.has(b.id)) continue;
    const date = chicagoDate(b.startsAt);
    if (date < fromDate || date > toDate) continue;
    blocks.push({
      date,
      startTime: chicagoTime(b.startsAt),
      start: b.startsAt,
      end: b.endsAt,
      state: b.status === 'confirmed' ? 'confirmed' : 'requested',
      bookingId: b.id,
      reasons: [],
    });
  }
  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());

  return { blocks, calendarChecked: input.busy.checked, windowStart: window.start, windowEnd: window.end };
}

// What a band's page gets: no reasons, no other bands' details.
export type BandBlock = Omit<Block, 'reasons'>;

export function forBand(a: Availability): { blocks: BandBlock[]; windowStart: Date; windowEnd: Date } {
  return {
    blocks: a.blocks.map(({ reasons: _r, ...rest }) => {
      void _r;
      return rest;
    }),
    windowStart: a.windowStart,
    windowEnd: a.windowEnd,
  };
}

// Is this exact block open right now? The request route re-checks every block
// a band asks for against a fresh computation (the DB constraint is the final
// backstop against a race).
export function isOpenBlock(a: Availability, start: Date): boolean {
  return a.blocks.some((b) => b.start.getTime() === start.getTime() && b.state === 'open');
}

// --- conflicts ---------------------------------------------------------------

export interface Conflict {
  bookingId: number;
  reasons: Reason[];
}

// Confirmed bookings that a show, Not-available day, blackout or busy time
// now lands on. Flagged for admin; never cancelled automatically.
export function findConflicts(bookings: EngineBooking[], c: Constraints, now: Date): Conflict[] {
  const out: Conflict[] = [];
  for (const b of bookings) {
    if (b.status !== 'confirmed' || b.endsAt.getTime() <= now.getTime()) continue;
    const reasons = constraintReasons({ start: b.startsAt, end: b.endsAt }, c);
    if (reasons.length) out.push({ bookingId: b.id, reasons });
  }
  return out;
}
