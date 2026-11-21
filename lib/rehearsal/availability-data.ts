import { sql } from '../db';
import { getDayWindows, getRehearsalSettings } from './settings';
import {
  addDays,
  bookingWindow,
  chicagoDate,
  computeAvailability,
  constraintReasons,
  startOfChicagoDay,
  type Availability,
  type Constraints,
  type Reason,
  type BookingStatus,
  type EngineBooking,
  type Interval,
} from './availability.ts';

// Loads the real inputs for the availability engine and runs it. Shows are
// read from the existing shows table, unchanged (any status but cancelled /
// postponed, announced or not); blocks from rehearsal_blackouts, the master
// Calendar's blocks (Booking's old Not-available days were folded into them by
// migration 122). Calendar feeds are no longer read: the engine's
// `unavailableDays` and `busy` inputs stay in its signature but are always empty.

const NO_BUSY = { intervals: [], checked: true };

export async function loadAvailability(
  opts: {
    viewerBandId?: number;
    fromDate?: string;
    now?: Date;
    // Treat these bookings' time as free (validating a change).
    ignoreBookingIds?: number[];
    // Also return, per booking, its day's free time with that booking left
    // out: what a band sees when moving it.
    freeIgnoring?: number[];
  } = {},
): Promise<{
  availability: Availability;
  settings: Awaited<ReturnType<typeof getRehearsalSettings>>;
  freeIgnoring: Map<number, Interval[]>;
}> {
  const now = opts.now ?? new Date();
  const [settings, windows] = await Promise.all([getRehearsalSettings(), getDayWindows()]);

  const fromDate = opts.fromDate ?? chicagoDate(now);
  const window = bookingWindow(now, settings);
  // One spare day each side: blackouts and busy times can span midnight.
  const lastDate = addDays(chicagoDate(window.end), 1);
  const spanStart = startOfChicagoDay(addDays(fromDate, -1));
  const spanEnd = startOfChicagoDay(addDays(lastDate, 1));

  const [shows, blackouts, bookings] = await Promise.all([
    sql<{ date: string }[]>`
      select distinct date::text as date
      from shows
      where status not in ('cancelled', 'postponed')
        and date between ${addDays(fromDate, -1)}::date and ${lastDate}::date
    `,
    sql<Array<{ start: Date; end: Date }>>`
      select starts_at as start, ends_at as "end"
      from rehearsal_blackouts
      where ends_at > ${spanStart} and starts_at < ${spanEnd}
    `,
    sql<
      Array<{ id: number; bandId: number; startsAt: Date; endsAt: Date; status: BookingStatus; expiresAt: Date }>
    >`
      select id::int as id, band_id::int as "bandId", starts_at as "startsAt", ends_at as "endsAt",
             status, expires_at as "expiresAt"
      from rehearsal_bookings
      where status in ('pending', 'confirmed')
        and ends_at > ${spanStart} and starts_at < ${spanEnd}
    `,
  ]);

  const input = {
    now,
    settings,
    windows,
    showDates: shows.map((r) => r.date),
    unavailableDays: [],
    blackouts: blackouts.map((r): Interval => ({ start: r.start, end: r.end })),
    busy: NO_BUSY,
    bookings: bookings.map((r): EngineBooking => ({ ...r })),
    viewerBandId: opts.viewerBandId,
    ignoreBookingIds: opts.ignoreBookingIds,
    fromDate,
  };
  const availability = computeAvailability(input);

  const freeIgnoring = new Map<number, Interval[]>();
  for (const id of opts.freeIgnoring ?? []) {
    const b = bookings.find((x) => x.id === id);
    if (!b) continue;
    const date = chicagoDate(b.startsAt);
    if (date < fromDate) continue;
    const day = computeAvailability({ ...input, ignoreBookingIds: [id], fromDate: date }).days[0];
    if (day?.date === date) freeIgnoring.set(id, day.free);
  }

  return { availability, settings, freeIgnoring };
}

// Why each of these bookings would now clash (a show or block landed on it
// since it was requested). Admin-only:
// the review page and the request email warn before Alex approves.
export async function clashesFor(
  bookings: Array<{ id: number; startsAt: Date; endsAt: Date }>,
): Promise<{ reasons: Map<number, Reason[]>; calendarChecked: boolean }> {
  const reasons = new Map<number, Reason[]>();
  if (bookings.length === 0) return { reasons, calendarChecked: true };
  const settings = await getRehearsalSettings();
  const first = chicagoDate(new Date(Math.min(...bookings.map((b) => b.startsAt.getTime()))));
  const last = chicagoDate(new Date(Math.max(...bookings.map((b) => b.endsAt.getTime()))));
  const spanStart = startOfChicagoDay(addDays(first, -1));
  const spanEnd = startOfChicagoDay(addDays(last, 2));

  const [shows, blackouts] = await Promise.all([
    sql<{ date: string }[]>`
      select distinct date::text as date from shows
      where status not in ('cancelled', 'postponed') and date between ${addDays(first, -1)}::date and ${last}::date
    `,
    sql<Array<{ start: Date; end: Date }>>`
      select starts_at as start, ends_at as "end" from rehearsal_blackouts
      where ends_at > ${spanStart} and starts_at < ${spanEnd}
    `,
  ]);
  const c: Constraints = {
    settings,
    showDates: shows.map((r) => r.date),
    unavailableDays: [],
    blackouts: blackouts.map((r) => ({ start: r.start, end: r.end })),
    busy: [],
  };
  for (const b of bookings) {
    const r = constraintReasons({ start: b.startsAt, end: b.endsAt }, c);
    if (r.length) reasons.set(b.id, r);
  }
  return { reasons, calendarChecked: true };
}
