import { sql } from '../db';
import { getRehearsalSettings, getStandingHours } from './settings';
import { getBusyTimes, type FeedStatus } from './busy';
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
// postponed, announced or not); Not-available days from booking_days.

export async function loadAvailability(
  opts: { viewerBandId?: number; fromDate?: string; now?: Date; forceCalendar?: boolean } = {},
): Promise<{ availability: Availability; feeds: FeedStatus[] }> {
  const now = opts.now ?? new Date();
  const [settings, hours] = await Promise.all([getRehearsalSettings(), getStandingHours()]);

  const fromDate = opts.fromDate ?? chicagoDate(now);
  const window = bookingWindow(now, settings);
  // One spare day each side: a block may run past midnight into the next day.
  const lastDate = addDays(chicagoDate(window.end), 1);
  const spanStart = startOfChicagoDay(addDays(fromDate, -1));
  const spanEnd = startOfChicagoDay(addDays(lastDate, 1));

  const [shows, away, blackouts, bookings, calendar] = await Promise.all([
    sql<{ date: string }[]>`
      select distinct date::text as date
      from shows
      where status not in ('cancelled', 'postponed')
        and date between ${addDays(fromDate, -1)}::date and ${lastDate}::date
    `,
    sql<{ date: string }[]>`
      select date::text as date
      from booking_days
      where unavailable
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
    getBusyTimes(settings.icsFeedUrls, spanStart, spanEnd, { now, force: opts.forceCalendar }),
  ]);

  const availability = computeAvailability({
    now,
    settings,
    hours,
    showDates: shows.map((r) => r.date),
    unavailableDays: away.map((r) => r.date),
    blackouts: blackouts.map((r): Interval => ({ start: r.start, end: r.end })),
    busy: calendar.busy,
    bookings: bookings.map((r): EngineBooking => ({ ...r })),
    viewerBandId: opts.viewerBandId,
    fromDate,
  });

  return { availability, feeds: calendar.feeds };
}

// Why each of these bookings would now clash (a show, Not-available day,
// blackout or busy time landed on it since it was requested). Admin-only:
// the review page and the request email warn before Alex approves.
export async function clashesFor(
  bookings: Array<{ id: number; startsAt: Date; endsAt: Date }>,
  now = new Date(),
): Promise<{ reasons: Map<number, Reason[]>; calendarChecked: boolean }> {
  const reasons = new Map<number, Reason[]>();
  if (bookings.length === 0) return { reasons, calendarChecked: true };
  const settings = await getRehearsalSettings();
  const first = chicagoDate(new Date(Math.min(...bookings.map((b) => b.startsAt.getTime()))));
  const last = chicagoDate(new Date(Math.max(...bookings.map((b) => b.endsAt.getTime()))));
  const spanStart = startOfChicagoDay(addDays(first, -1));
  const spanEnd = startOfChicagoDay(addDays(last, 2));

  const [shows, away, blackouts, calendar] = await Promise.all([
    sql<{ date: string }[]>`
      select distinct date::text as date from shows
      where status not in ('cancelled', 'postponed') and date between ${addDays(first, -1)}::date and ${last}::date
    `,
    sql<{ date: string }[]>`
      select date::text as date from booking_days
      where unavailable and date between ${addDays(first, -1)}::date and ${last}::date
    `,
    sql<Array<{ start: Date; end: Date }>>`
      select starts_at as start, ends_at as "end" from rehearsal_blackouts
      where ends_at > ${spanStart} and starts_at < ${spanEnd}
    `,
    getBusyTimes(settings.icsFeedUrls, spanStart, spanEnd, { now }),
  ]);
  const c: Constraints = {
    settings,
    showDates: shows.map((r) => r.date),
    unavailableDays: away.map((r) => r.date),
    blackouts: blackouts.map((r) => ({ start: r.start, end: r.end })),
    busy: calendar.busy.intervals,
  };
  for (const b of bookings) {
    const r = constraintReasons({ start: b.startsAt, end: b.endsAt }, c);
    if (r.length) reasons.set(b.id, r);
  }
  return { reasons, calendarChecked: calendar.busy.checked };
}
