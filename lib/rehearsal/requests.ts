import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { getRehearsalSettings } from './settings';
import { loadAvailability } from './availability-data';
import { isOpenSpan } from './availability.ts';
import { lockBookings, bufferClash } from './booking-lock';
import { MAX_SESSIONS_PER_REQUEST, canBandCancel, planRequest, type ParsedRequest } from './request-rules.ts';
import { describeRule, type Freq } from './series.ts';
import { chicagoDate } from './availability.ts';

// Band-side writes: send a request, cancel a booking. Every pick is checked
// against a fresh availability computation, then re-checked inside the write
// transaction under the bookings lock (the turnover buffer isn't in the DB
// constraint). The no-overlap constraint (migration 109) is the final backstop.

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'expired';

export interface BandBooking {
  id: number;
  catalogueId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  priceCents: number;
  note: string;
  gearNeeded: string[];
  gearNotes: string;
  declineReason: string;
  expiresAt: Date;
  repeatLabel: string | null; // "Weekly on Wednesdays" when part of a series
  replacesBookingId: number | null; // a change request: the booking it would replace
}

// The band's bookings that haven't ended (plus anything that ended in the
// last day, so a just-finished session doesn't vanish mid-evening).
export async function listBandBookings(bandId: number): Promise<BandBooking[]> {
  return sql<BandBooking[]>`
    select id::int as id, catalogue_id as "catalogueId", starts_at as "startsAt", ends_at as "endsAt",
           status, price_cents as "priceCents", note, gear_needed as "gearNeeded", gear_notes as "gearNotes",
           decline_reason as "declineReason", expires_at as "expiresAt",
           replaces_booking_id::int as "replacesBookingId",
           series_id::int as "seriesId", (select freq from rehearsal_series s where s.id = series_id) as freq,
           (select min(starts_at) from rehearsal_bookings f where f.series_id = rehearsal_bookings.series_id) as "seriesStart"
    from rehearsal_bookings
    where band_id = ${bandId} and ends_at > now() - interval '1 day'
    order by starts_at
  `.then((rows) =>
    (rows as unknown as Array<BandBooking & { seriesId: number | null; freq: Freq | null; seriesStart: Date | null }>).map(
      ({ seriesId, freq, seriesStart, ...b }) => ({
        ...b,
        repeatLabel: seriesId && freq && seriesStart ? describeRule(chicagoDate(seriesStart), freq) : null,
      }),
    ),
  );
}

export type Skipped = { start: Date; why: 'unavailable' };

export type RequestOutcome =
  // later: dates past the window, booked automatically once the series is approved.
  | { ok: true; requestKey: string; catalogueIds: string[]; skipped: Skipped[]; later: number; ongoing: boolean }
  | { ok: false; error: string; status: number };

export async function createRequest(bandId: number, req: ParsedRequest, now = new Date()): Promise<RequestOutcome> {
  const settings = await getRehearsalSettings();
  const { availability } = await loadAvailability({ viewerBandId: bandId, now });

  // Same planner the booking page previews with.
  const plan = planRequest(
    req.items,
    (d, minutes) => isOpenSpan(availability, settings, d, minutes),
    availability.windowEnd,
    settings.bufferMinutes,
  );
  if (plan.closed.length) {
    return {
      ok: false,
      status: 409,
      error:
        plan.closed.length === 1
          ? 'One of your picks isn’t open any more. The calendar has been refreshed — check your request.'
          : 'Some of your picks aren’t open any more. The calendar has been refreshed — check your request.',
    };
  }
  if (plan.sessions.length === 0) return { ok: false, status: 409, error: 'None of those dates are open.' };
  if (plan.sessions.length > MAX_SESSIONS_PER_REQUEST) {
    return { ok: false, status: 400, error: `That's more than ${MAX_SESSIONS_PER_REQUEST} sessions — split it up.` };
  }

  const requestKey = randomBytes(12).toString('base64url');
  const expiresAt = new Date(now.getTime() + settings.pendingExpiryDays * 86_400_000);
  // Prices are only snapshotted while payments are on; with payments off
  // nothing is stored as owed (the rate card is display-only).
  const onePrice = settings.paymentsEnabled ? settings.priceCents : 0;
  const repeatPrice = settings.paymentsEnabled ? (settings.repeatPriceCents ?? settings.priceCents) : 0;

  try {
    const catalogueIds = await sql.begin(async (tx) => {
      await lockBookings(tx);
      // Re-check under the lock: nothing booked since our check landed inside
      // a pick or its buffer.
      for (const x of plan.sessions) {
        if (await bufferClash(tx, x.start, x.end, settings.bufferMinutes, now)) throw new TakenError();
      }
      // One series per repeating item that booked anything.
      const seriesOf = new Map<number, number>();
      for (const i of new Set(plan.sessions.filter((x) => x.repeat).map((x) => x.item))) {
        const rule = req.items[i].repeat!;
        const [row] = await tx<{ id: number }[]>`
          insert into rehearsal_series
            (band_id, freq, until_date, occurrences, payment_method, note, gear_needed, gear_notes,
             anchor_starts_at, block_minutes, price_cents, request_key)
          values
            (${bandId}, ${rule.freq}, ${rule.until ?? null}, ${rule.count ?? null},
             ${req.paymentMethod}, ${req.note}, ${req.gearNeeded}::text[], ${req.gearNotes},
             ${req.items[i].start}, ${req.items[i].minutes}, ${repeatPrice}, ${requestKey})
          returning id::int as id
        `;
        seriesOf.set(i, row.id);
      }
      const ids: string[] = [];
      for (const x of plan.sessions) {
        const [row] = await tx<{ catalogueId: string }[]>`
          insert into rehearsal_bookings
            (band_id, starts_at, ends_at, status, expires_at, price_cents, payment_method,
             note, gear_needed, gear_notes, request_key, calendar_unchecked, series_id)
          values
            (${bandId}, ${x.start}, ${x.end}, 'pending', ${expiresAt},
             ${x.repeat ? repeatPrice : onePrice}, ${req.paymentMethod}, ${req.note}, ${req.gearNeeded}::text[],
             ${req.gearNotes}, ${requestKey}, ${!availability.calendarChecked}, ${seriesOf.get(x.item) ?? null})
          returning catalogue_id as "catalogueId"
        `;
        ids.push(row.catalogueId);
      }
      // Prefill next time with what they asked for this time.
      await tx`
        update rehearsal_bands
        set default_gear_needed = ${req.gearNeeded}::text[], default_gear_notes = ${req.gearNotes}, updated_at = now()
        where id = ${bandId}
      `;
      return ids;
    });
    return {
      ok: true,
      requestKey,
      catalogueIds,
      skipped: plan.skipped.map((x) => ({ start: x.start, why: x.why })),
      later: plan.later.reduce((a, b) => a + b, 0),
      ongoing: req.items.some((i) => i.repeat && !i.repeat.until && !i.repeat.count),
    };
  } catch (e) {
    // TakenError: the locked re-check found a clash. 23P01 =
    // exclusion_violation: the DB backstop caught an overlap.
    if (e instanceof TakenError || (e as { code?: string }).code === '23P01') {
      return { ok: false, status: 409, error: 'Someone just asked for one of those times. Pick another.' };
    }
    throw e;
  }
}

class TakenError extends Error {}

export type CancelOutcome = { ok: true } | { ok: false; error: string; status: number };

export async function cancelBandBooking(bandId: number, bookingId: number, now = new Date()): Promise<CancelOutcome> {
  const settings = await getRehearsalSettings();
  return sql.begin(async (tx) => {
    const [b] = await tx<{ status: BookingStatus; startsAt: Date; replacesBookingId: number | null }[]>`
      select status, starts_at as "startsAt", replaces_booking_id::int as "replacesBookingId"
      from rehearsal_bookings
      where id = ${bookingId} and band_id = ${bandId}
      for update
    `;
    if (!b) return { ok: false as const, status: 404, error: 'That booking wasn’t found.' };
    // Withdrawing a change request is always fine: the original still stands.
    const withdrawingChange = b.status === 'pending' && b.replacesBookingId !== null;
    if (!withdrawingChange && !canBandCancel(b, now, settings.cancelCutoffHours)) {
      return {
        ok: false as const,
        status: 409,
        error: 'This booking can’t be cancelled online any more — please get in touch with Alex.',
      };
    }
    await tx`
      update rehearsal_bookings
      set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'band', updated_at = now()
      where id = ${bookingId}
    `;
    // Cancelling a booking drops any change still waiting on it.
    await tx`
      update rehearsal_bookings
      set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'band', updated_at = now()
      where replaces_booking_id = ${bookingId} and status = 'pending'
    `;
    return { ok: true as const };
  });
}

// --- changes -------------------------------------------------------------------

// A band asks to move a booking (and/or change its length or note). The new
// time goes in as a pending request pointing at the booking it replaces; a
// confirmed original keeps its time until Alex approves (approveBookings
// swaps them). A still-pending request is simply replaced: nothing is held
// for it yet. Allowed up to the session start; Alex approves anyway.

export interface ChangeInput {
  bookingId: number;
  start: Date;
  minutes: number;
  note: string;
}

export type ChangeOutcome =
  | { ok: true; requestKey: string; catalogueId: string }
  | { ok: false; error: string; status: number };

interface ChangeTarget {
  id: number;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  replacesBookingId: number | null;
  slotId: number | null;
  priceCents: number;
  paymentMethod: string;
  gearNeeded: string[];
  gearNotes: string;
  note: string;
}

// Confirmed and not started, or a live request.
export function canBandChange(b: { status: string; startsAt: Date; expiresAt: Date }, now: Date): boolean {
  if (b.startsAt <= now) return false;
  return b.status === 'confirmed' || (b.status === 'pending' && b.expiresAt > now);
}

export function parseChangeBody(body: unknown, allowedLengths: number[]): { ok: true; value: ChangeInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const bookingId = Number(b.bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) return { ok: false, error: 'Something went wrong — reload and try again.' };
  const start = typeof b.start === 'string' ? new Date(b.start) : null;
  if (!start || Number.isNaN(start.getTime())) return { ok: false, error: "That time isn't valid — reload and try again." };
  if (typeof b.minutes !== 'number' || !allowedLengths.includes(b.minutes)) return { ok: false, error: 'Pick how long.' };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > 2000) return { ok: false, error: 'Your note is too long (max 2000 characters).' };
  return { ok: true, value: { bookingId, start, minutes: b.minutes, note } };
}

export async function createChange(bandId: number, input: ChangeInput, now = new Date()): Promise<ChangeOutcome> {
  const settings = await getRehearsalSettings();
  const [t] = await sql<ChangeTarget[]>`
    select id::int as id, status, starts_at as "startsAt", ends_at as "endsAt", expires_at as "expiresAt",
           replaces_booking_id::int as "replacesBookingId", slot_id::int as "slotId",
           price_cents as "priceCents", payment_method as "paymentMethod",
           gear_needed as "gearNeeded", gear_notes as "gearNotes", note
    from rehearsal_bookings
    where id = ${input.bookingId} and band_id = ${bandId}
  `;
  if (!t) return { ok: false, status: 404, error: 'That booking wasn’t found.' };
  if (!canBandChange(t, now)) return { ok: false, status: 409, error: 'This booking can’t be changed any more.' };

  const end = new Date(input.start.getTime() + input.minutes * 60_000);
  if (input.start.getTime() === t.startsAt.getTime() && end.getTime() === t.endsAt.getTime() && input.note === t.note) {
    return { ok: false, status: 400, error: 'Nothing’s changed yet — pick a new time or edit the note.' };
  }

  // What the new time may overlap: the target itself, and (when the target is
  // a waiting change) the original it would replace.
  const ignore = [t.id, ...(t.replacesBookingId ? [t.replacesBookingId] : [])];
  const { availability } = await loadAvailability({ viewerBandId: bandId, now, ignoreBookingIds: ignore });
  if (!isOpenSpan(availability, settings, input.start, input.minutes)) {
    return { ok: false, status: 409, error: 'That time isn’t open any more. The calendar has been refreshed — pick another.' };
  }

  const confirmed = t.status === 'confirmed';
  const requestKey = randomBytes(12).toString('base64url');
  const expiresAt = new Date(now.getTime() + settings.pendingExpiryDays * 86_400_000);

  try {
    const catalogueId = await sql.begin(async (tx) => {
      await lockBookings(tx);
      // Re-read under the lock: still changeable, nothing else waiting on it.
      const [cur] = await tx<{ status: BookingStatus; expiresAt: Date; startsAt: Date }[]>`
        select status, expires_at as "expiresAt", starts_at as "startsAt"
        from rehearsal_bookings where id = ${t.id} for update
      `;
      if (!cur || cur.status !== t.status || !canBandChange(cur, now)) throw new GoneError();
      if (confirmed) {
        // A lapsed change that the daily job hasn't marked yet.
        await tx`
          update rehearsal_bookings set status = 'expired', updated_at = now()
          where replaces_booking_id = ${t.id} and status = 'pending' and expires_at <= ${now}
        `;
        const [waiting] = await tx<{ n: number }[]>`
          select count(*)::int as n from rehearsal_bookings
          where replaces_booking_id = ${t.id} and status = 'pending'
        `;
        if (waiting.n > 0) throw new WaitingError();
      } else {
        // A request that hasn't been approved yet just gives way to the new one.
        await tx`
          update rehearsal_bookings
          set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'band', updated_at = now()
          where id = ${t.id}
        `;
      }
      if (await bufferClash(tx, input.start, end, settings.bufferMinutes, now, ignore)) throw new TakenError();
      const [row] = await tx<{ catalogueId: string }[]>`
        insert into rehearsal_bookings
          (band_id, starts_at, ends_at, status, expires_at, price_cents, payment_method,
           note, gear_needed, gear_notes, request_key, calendar_unchecked,
           replaces_booking_id, slot_id)
        values
          (${bandId}, ${input.start}, ${end}, 'pending', ${expiresAt}, ${t.priceCents}, ${t.paymentMethod},
           ${input.note}, ${t.gearNeeded}::text[], ${t.gearNotes}, ${requestKey}, ${!availability.calendarChecked},
           ${confirmed ? t.id : (t.replacesBookingId ?? t.id)}, ${confirmed ? (t.slotId ?? t.id) : t.slotId})
        returning catalogue_id as "catalogueId"
      `;
      return row.catalogueId;
    });
    return { ok: true, requestKey, catalogueId };
  } catch (e) {
    if (e instanceof GoneError) return { ok: false, status: 409, error: 'This booking can’t be changed any more.' };
    if (e instanceof WaitingError) {
      return { ok: false, status: 409, error: 'You’ve already asked to change this one. Withdraw that first.' };
    }
    if (e instanceof TakenError || (e as { code?: string }).code === '23P01') {
      return { ok: false, status: 409, error: 'Someone just asked for that time. Pick another.' };
    }
    throw e;
  }
}

class GoneError extends Error {}
class WaitingError extends Error {}
