// Rehearsal availability engine. PURE: no DB, no network, no clock. Callers
// pass in everything (lib/rehearsal/availability-data.ts loads the real data),
// so it runs under `npm test` with fake shows / bookings / busy times.
//
// Flexible hours (migration 118). Each weekday has one broad bookable window
// (an outer limit only). Inside it everything is open, minus:
//   past / window  — before now + window_min_hours, or after now + window_max_weeks
//   show           — a show day, from show_day_from (or the whole day)
//   unavailable_day— a day marked Not available in Booking (booking_days)
//   blackout       — a manual rehearsal block (admin Calendar → Block time)
//   busy           — a busy time from the private .ics feeds
//   booked         — a pending (not yet expired) or confirmed booking, widened
//                    by the turnover buffer on both sides
// What's left is each day's free stretches. A band picks a start on the step
// grid and one of the allowed lengths that fits inside one stretch.
// What a band sees never says why time is unavailable (forBand()).
//
// Imports use the .ts extension so `node --test` can load this file directly.

import { wallTimeToUtc } from '../local-time.ts';

export const TIME_ZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type ShowDayRule = 'whole_day' | 'from_time';

export interface EngineSettings {
  windowMinHours: number;
  windowMaxWeeks: number;
  showDayRule: ShowDayRule;
  showDayFrom: string; // "HH:MM"
  startStepMinutes: number;
  allowedLengths: number[]; // minutes
  bufferMinutes: number;
}

export interface DayWindow {
  weekday: number; // 0 = Sunday … 6 = Saturday
  opens: string; // "HH:MM"
  closes: string; // "HH:MM", "24:00" = midnight
  closed: boolean;
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
  windows: DayWindow[];
  showDates: string[]; // "YYYY-MM-DD" (Chicago)
  unavailableDays: string[]; // "YYYY-MM-DD"
  blackouts: Interval[];
  busy: BusyTimes;
  bookings: EngineBooking[];
  // The band looking (its own bookings show as requested/confirmed). Omit for admin.
  viewerBandId?: number;
  // First Chicago date to lay out (default: today). Days before the window
  // are still returned (no free time) so a week view has no holes.
  fromDate?: string;
}

export type Reason = 'past' | 'window' | 'show' | 'unavailable_day' | 'blackout' | 'busy' | 'booked';

export interface OwnBooking {
  bookingId: number;
  start: Date;
  end: Date;
  state: 'requested' | 'confirmed';
}

export interface BlockedSpan {
  start: Date;
  end: Date;
  reason: Reason;
}

export interface Day {
  date: string; // Chicago date
  window: Interval | null; // the weekday's bookable window; null = closed
  free: Interval[]; // open stretches, merged, ascending
  blocked: BlockedSpan[]; // admin-only: what took time out of the window (clipped to it)
  own: OwnBooking[]; // the viewer's own pending/confirmed bookings that day
}

export interface Availability {
  days: Day[];
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

// --- free time ---------------------------------------------------------------

function windowFor(date: string, windows: DayWindow[]): Interval | null {
  const w = windows.find((x) => x.weekday === weekdayOf(date));
  if (!w || w.closed) return null;
  const [oh, om] = hm(w.opens);
  const start = wallTimeToUtc(date, oh, om, TIME_ZONE);
  const end = w.closes === '24:00' ? startOfChicagoDay(addDays(date, 1)) : wallTimeToUtc(date, ...hm(w.closes), TIME_ZONE);
  return end > start ? { start, end } : null;
}

// `from` minus every interval in `cut`, merged and ascending.
export function subtract(from: Interval, cut: Interval[]): Interval[] {
  let out: Interval[] = [from];
  for (const c of cut) {
    const next: Interval[] = [];
    for (const iv of out) {
      if (!overlaps(iv, c)) {
        next.push(iv);
        continue;
      }
      if (c.start > iv.start) next.push({ start: iv.start, end: c.start });
      if (c.end < iv.end) next.push({ start: c.end, end: iv.end });
    }
    out = next;
  }
  return out.sort((x, y) => x.start.getTime() - y.start.getTime());
}

function clipTo(iv: Interval, to: Interval): Interval | null {
  const start = iv.start > to.start ? iv.start : to.start;
  const end = iv.end < to.end ? iv.end : to.end;
  return end > start ? { start, end } : null;
}

export function computeAvailability(input: EngineInput): Availability {
  const { now, settings } = input;
  const window = bookingWindow(now, settings);
  const fromDate = input.fromDate ?? chicagoDate(now);
  const toDate = chicagoDate(window.end);
  const bufferMs = settings.bufferMinutes * 60_000;

  const shows = new Set(input.showDates);
  const away = new Set(input.unavailableDays);
  const holding = input.bookings.filter((b) => holdsTime(b, now));

  const days: Day[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const own: OwnBooking[] = holding
      .filter((b) => b.bandId === input.viewerBandId && chicagoDate(b.startsAt) === date)
      .map((b) => ({
        bookingId: b.id,
        start: b.startsAt,
        end: b.endsAt,
        state: b.status === 'confirmed' ? ('confirmed' as const) : ('requested' as const),
      }));
    const dayWin = windowFor(date, input.windows);
    if (!dayWin) {
      days.push({ date, window: null, free: [], blocked: [], own });
      continue;
    }

    const spans: BlockedSpan[] = [];
    const add = (iv: Interval, reason: Reason) => {
      const c = clipTo(iv, dayWin);
      if (c) spans.push({ ...c, reason });
    };
    add({ start: new Date(0), end: now }, 'past');
    if (window.start > now) add({ start: now, end: window.start }, 'window');
    if (shows.has(date)) add(showDayInterval(date, settings), 'show');
    if (away.has(date)) add(wholeDay(date), 'unavailable_day');
    for (const bl of input.blackouts) add(bl, 'blackout');
    for (const bz of input.busy.intervals) add(bz, 'busy');
    for (const bk of holding) {
      add({ start: new Date(bk.startsAt.getTime() - bufferMs), end: new Date(bk.endsAt.getTime() + bufferMs) }, 'booked');
    }
    spans.sort((x, y) => x.start.getTime() - y.start.getTime());
    days.push({ date, window: dayWin, free: subtract(dayWin, spans), blocked: spans, own });
  }

  return { days, calendarChecked: input.busy.checked, windowStart: window.start, windowEnd: window.end };
}

// What a band's page gets: free stretches and its own bookings, no reasons.
export interface BandDay {
  date: string;
  window: Interval | null;
  free: Interval[];
  own: OwnBooking[];
}

export function forBand(a: Availability): { days: BandDay[]; windowStart: Date; windowEnd: Date } {
  return {
    days: a.days.map(({ date, window, free, own }) => ({ date, window, free, own })),
    windowStart: a.windowStart,
    windowEnd: a.windowEnd,
  };
}

// On the start-time grid? (Chicago wall clock, so 6:00pm stays on the grid
// across DST.)
export function onGrid(start: Date, stepMinutes: number): boolean {
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) return false;
  const [h, m] = hm(chicagoTime(start));
  return (h * 60 + m) % stepMinutes === 0;
}

// Can a band ask for `minutes` starting at `start` right now? Start on the
// grid and inside the booking window, length allowed, and the whole span
// inside one free stretch. The request route re-checks every pick against a
// fresh computation, under a lock (the buffer isn't in the DB constraint).
export function isOpenSpan(
  a: Availability,
  s: Pick<EngineSettings, 'startStepMinutes' | 'allowedLengths'>,
  start: Date,
  minutes: number,
): boolean {
  if (!s.allowedLengths.includes(minutes) || !onGrid(start, s.startStepMinutes)) return false;
  return spanFits(a, start, minutes);
}

// The span is free and starts inside the booking window (no grid or length
// rule): extending an approved series keeps its own start and length even if
// the settings have changed since.
export function spanFits(a: Availability, start: Date, minutes: number): boolean {
  if (start < a.windowStart || start >= a.windowEnd) return false;
  const end = new Date(start.getTime() + minutes * 60_000);
  const day = a.days.find((d) => d.date === chicagoDate(start));
  return Boolean(day?.free.some((f) => f.start <= start && end <= f.end));
}

// Every grid start in a day's free stretches where at least the shortest
// allowed length fits, with the lengths that fit from it. Shared by the
// booking page and tests.
export function startOptions(
  free: Interval[],
  s: Pick<EngineSettings, 'startStepMinutes' | 'allowedLengths'>,
  windowEnd?: Date,
): Array<{ start: Date; lengths: number[] }> {
  const stepMs = s.startStepMinutes * 60_000;
  const out: Array<{ start: Date; lengths: number[] }> = [];
  for (const f of free) {
    // First grid point at or after the stretch start.
    let t = Math.ceil(f.start.getTime() / 60_000) * 60_000;
    for (let i = 0; i < s.startStepMinutes && !onGrid(new Date(t), s.startStepMinutes); i++) t += 60_000;
    for (; t < f.end.getTime(); t += stepMs) {
      const start = new Date(t);
      if (!onGrid(start, s.startStepMinutes)) continue; // DST edge
      if (windowEnd && start >= windowEnd) break;
      const lengths = s.allowedLengths.filter((m) => t + m * 60_000 <= f.end.getTime());
      if (lengths.length) out.push({ start, lengths });
    }
  }
  return out;
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
