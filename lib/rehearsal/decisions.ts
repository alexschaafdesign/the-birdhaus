import { sql } from '../db';
import { chicagoDate, type BookingStatus } from './availability.ts';
import { describeRule, type Freq } from './series.ts';

// Admin-side reads and writes on rehearsal bookings: approve, decline, payment
// status, and the lists the Requests and Bands screens show. Emails are sent
// by the callers (lib/rehearsal/emails.ts) after a write commits.

export type PaymentStatus = 'unpaid' | 'paid' | 'comped' | 'refunded';
export type PaymentMethod = 'venmo' | 'square' | 'cash';

export interface AdminBooking {
  id: number;
  catalogueId: string;
  bandId: number;
  bandName: string;
  bandEmail: string;
  rateNotes: string; // private
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  expiresAt: Date;
  priceCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentMethod | null;
  paidAt: Date | null;
  note: string;
  gearNeeded: string[];
  gearNotes: string;
  declineReason: string;
  requestKey: string | null;
  calendarUnchecked: boolean;
  conflict: boolean;
  cancelledBy: 'band' | 'admin' | null;
  adminEmailedAt: Date | null;
  bandEmailedAt: Date | null;
  createdAt: Date;
  seriesId: number | null;
  seriesFreq: Freq | null;
  seriesStart: Date | null; // first occurrence, for the "3rd Tuesday" label
  seriesOngoing: boolean;
  // A change request: the booking it would replace (all null otherwise).
  replacesId: number | null;
  replacesCatalogueId: string | null;
  replacesStartsAt: Date | null;
  replacesEndsAt: Date | null;
  replacesStatus: BookingStatus | null;
}

// "Weekly on Wednesdays" for a series booking, else null.
export function repeatLabel(b: Pick<AdminBooking, 'seriesFreq' | 'seriesStart' | 'seriesOngoing'>): string | null {
  if (!b.seriesFreq || !b.seriesStart) return null;
  return `${describeRule(chicagoDate(b.seriesStart), b.seriesFreq)}${b.seriesOngoing ? ', until ended' : ''}`;
}

// A fresh fragment per call (postgres.js composition).
function select() {
  return sql`
    select b.id::int as id, b.catalogue_id as "catalogueId", b.band_id::int as "bandId",
           r.name as "bandName", r.email as "bandEmail", r.rate_notes as "rateNotes",
           b.starts_at as "startsAt", b.ends_at as "endsAt", b.status, b.expires_at as "expiresAt",
           b.price_cents as "priceCents", b.payment_method as "paymentMethod",
           b.payment_status as "paymentStatus", b.payment_provider as "paymentProvider", b.paid_at as "paidAt",
           b.note, b.gear_needed as "gearNeeded", b.gear_notes as "gearNotes",
           b.decline_reason as "declineReason", b.request_key as "requestKey",
           b.calendar_unchecked as "calendarUnchecked", b.conflict, b.cancelled_by as "cancelledBy",
           b.admin_emailed_at as "adminEmailedAt", b.band_emailed_at as "bandEmailedAt",
           b.created_at as "createdAt",
           b.series_id::int as "seriesId", s.freq as "seriesFreq",
           (select min(f.starts_at) from rehearsal_bookings f where f.series_id = b.series_id) as "seriesStart",
           (s.id is not null and s.until_date is null and s.occurrences is null) as "seriesOngoing",
           o.id::int as "replacesId", o.catalogue_id as "replacesCatalogueId",
           o.starts_at as "replacesStartsAt", o.ends_at as "replacesEndsAt", o.status as "replacesStatus"
    from rehearsal_bookings b
    join rehearsal_bands r on r.id = b.band_id
    left join rehearsal_series s on s.id = b.series_id
    left join rehearsal_bookings o on o.id = b.replaces_booking_id
  `;
}

// Pending is only "live" until it expires or its session starts; after that
// it's shown (and treated) as expired, whatever the stored status says.
export function isLivePending(b: Pick<AdminBooking, 'status' | 'expiresAt' | 'startsAt'>, now = new Date()): boolean {
  return b.status === 'pending' && b.expiresAt > now && b.startsAt > now;
}

export function displayStatus(b: Pick<AdminBooking, 'status' | 'expiresAt' | 'startsAt'>, now = new Date()): BookingStatus {
  return b.status === 'pending' && !isLivePending(b, now) ? 'expired' : b.status;
}

export async function bookingsByRequest(requestKey: string): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`${select()} where b.request_key = ${requestKey} order by b.starts_at`;
}

export async function bookingsByIds(ids: number[]): Promise<AdminBooking[]> {
  if (ids.length === 0) return [];
  return sql<AdminBooking[]>`${select()} where b.id in ${sql(ids)} order by b.starts_at`;
}

export async function pendingBookings(): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`${select()} where b.status = 'pending' order by b.created_at, b.starts_at`;
}

export async function upcomingConfirmed(): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`
    ${select()} where b.status = 'confirmed' and b.ends_at > now() order by b.starts_at
  `;
}

// Sessions that have started and aren't paid or comped.
export async function outstandingBookings(): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`
    ${select()} where b.status = 'confirmed' and b.payment_status = 'unpaid' and b.starts_at <= now()
    order by b.starts_at
  `;
}

export async function bandHistory(bandId: number): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`${select()} where b.band_id = ${bandId} order by b.starts_at desc`;
}

// Group a list into requests (blocks sent together), oldest request first.
export function groupByRequest(list: AdminBooking[]): AdminBooking[][] {
  const map = new Map<string, AdminBooking[]>();
  for (const b of list) {
    const k = b.requestKey ?? `booking-${b.id}`;
    map.set(k, [...(map.get(k) ?? []), b]);
  }
  return [...map.values()];
}

// --- writes ------------------------------------------------------------------

// Confirms live pending bookings. Returns what was approved; anything else
// (already decided, expired, already started) is left alone.
//
// An approved change replaces its original in the same transaction: the
// original is cancelled and its payment record (paid, comped, …) moves to
// the new booking, so a paid session isn't counted twice in the band's
// totals. The new booking already carries the original's price.
export async function approveBookings(ids: number[], now = new Date()): Promise<number[]> {
  if (ids.length === 0) return [];
  const { approved, swapped } = await sql.begin(async (tx) => {
    const rows = await tx<{ id: number; replacesBookingId: number | null }[]>`
      update rehearsal_bookings
      set status = 'confirmed', decided_at = ${now}, updated_at = now()
      where id in ${sql(ids)} and status = 'pending' and expires_at > ${now} and starts_at > ${now}
      returning id::int as id, replaces_booking_id::int as "replacesBookingId"
    `;
    const swapped: number[] = [];
    for (const r of rows) {
      if (!r.replacesBookingId) continue;
      const [o] = await tx<
        { status: BookingStatus; paymentStatus: PaymentStatus; paymentProvider: PaymentMethod | null; paymentRef: string | null; paidAt: Date | null }[]
      >`
        select status, payment_status as "paymentStatus", payment_provider as "paymentProvider",
               payment_ref as "paymentRef", paid_at as "paidAt"
        from rehearsal_bookings where id = ${r.replacesBookingId}
        for update
      `;
      if (!o || o.status !== 'confirmed') continue; // already gone: the change just stands on its own
      await tx`
        update rehearsal_bookings
        set payment_status = ${o.paymentStatus}, payment_provider = ${o.paymentProvider},
            payment_ref = ${o.paymentRef}, paid_at = ${o.paidAt}, updated_at = now()
        where id = ${r.id}
      `;
      await tx`
        update rehearsal_bookings
        set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'band',
            payment_status = 'unpaid', payment_provider = null, payment_ref = null, paid_at = null,
            updated_at = now()
        where id = ${r.replacesBookingId}
      `;
      swapped.push(r.replacesBookingId);
    }
    return { approved: rows.map((r) => r.id), swapped };
  });
  await syncSeriesStatus(swapped);
  return approved;
}

// Declines pending bookings (expired-but-unmarked ones too, so Alex can tidy).
export async function declineBookings(ids: number[], reason: string, now = new Date()): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: number }[]>`
    update rehearsal_bookings
    set status = 'declined', decline_reason = ${reason.trim().slice(0, 2000)}, decided_at = ${now}, updated_at = now()
    where id in ${sql(ids)} and status = 'pending'
    returning id::int as id
  `;
  return rows.map((r) => r.id);
}

// One-click payment status. Paid records how (the method the band chose,
// unless told otherwise) and when; unpaid/comped clear both.
export async function setPaymentStatus(
  id: number,
  status: PaymentStatus,
  provider?: PaymentMethod,
  now = new Date(),
): Promise<boolean> {
  const rows =
    status === 'paid'
      ? await sql`
          update rehearsal_bookings
          set payment_status = 'paid', paid_at = ${now},
              payment_provider = coalesce(${provider ?? null}, payment_method), updated_at = now()
          where id = ${id} and status = 'confirmed'
          returning id
        `
      : status === 'refunded'
        ? await sql`
            update rehearsal_bookings set payment_status = 'refunded', updated_at = now()
            where id = ${id} and payment_status = 'paid'
            returning id
          `
        : await sql`
            update rehearsal_bookings
            set payment_status = ${status}, paid_at = null, payment_provider = null, updated_at = now()
            where id = ${id} and status = 'confirmed'
            returning id
          `;
  return rows.length > 0;
}

export async function markEmailed(ids: number[], who: 'admin' | 'band', at = new Date()): Promise<void> {
  if (ids.length === 0) return;
  if (who === 'admin') await sql`update rehearsal_bookings set admin_emailed_at = ${at} where id in ${sql(ids)}`;
  else await sql`update rehearsal_bookings set band_emailed_at = ${at} where id in ${sql(ids)}`;
}

// --- band totals -------------------------------------------------------------

export interface BandTotals {
  sessions: number; // confirmed sessions that have started
  upcoming: number;
  paidCents: number;
  outstandingCents: number;
  paidSessions: number; // marked paid (or comped)
  waitingSessions: number; // played, confirmed, not marked paid yet
}

export async function bandTotals(bandId: number): Promise<BandTotals> {
  const [t] = await sql<BandTotals[]>`
    select
      count(*) filter (where status = 'confirmed' and starts_at <= now())::int as sessions,
      count(*) filter (where status = 'confirmed' and starts_at > now())::int as upcoming,
      coalesce(sum(price_cents) filter (where payment_status = 'paid'), 0)::int as "paidCents",
      coalesce(sum(price_cents) filter (where status = 'confirmed' and payment_status = 'unpaid' and starts_at <= now()), 0)::int
        as "outstandingCents",
      count(*) filter (where status = 'confirmed' and payment_status in ('paid', 'comped'))::int as "paidSessions",
      count(*) filter (where status = 'confirmed' and payment_status = 'unpaid' and starts_at <= now())::int
        as "waitingSessions"
    from rehearsal_bookings
    where band_id = ${bandId}
  `;
  return t;
}

// A series is confirmed once any of its sessions is, declined once none are
// pending or confirmed. Called after approve/decline.
export async function syncSeriesStatus(bookingIds: number[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await sql`
    update rehearsal_series s set
      status = case
        when exists (select 1 from rehearsal_bookings b where b.series_id = s.id and b.status = 'confirmed') then 'confirmed'
        when exists (select 1 from rehearsal_bookings b where b.series_id = s.id and b.status = 'pending') then 'pending'
        else 'declined'
      end,
      updated_at = now()
    where s.id in (select series_id from rehearsal_bookings where id in ${sql(bookingIds)} and series_id is not null)
  `;
}

// Admin edits one session's gear (a series' gear was copied onto each).
export async function setBookingGear(id: number, gearNeeded: string[], gearNotes: string): Promise<boolean> {
  const rows = await sql`
    update rehearsal_bookings set gear_needed = ${gearNeeded}::text[], gear_notes = ${gearNotes}, updated_at = now()
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

// Pending and confirmed bookings in a span (admin Calendar).
export async function bookingsBetween(from: Date, to: Date): Promise<AdminBooking[]> {
  return sql<AdminBooking[]>`
    ${select()} where b.status in ('pending', 'confirmed') and b.ends_at > ${from} and b.starts_at < ${to}
    order by b.starts_at
  `;
}
