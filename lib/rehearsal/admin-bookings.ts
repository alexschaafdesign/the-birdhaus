import { sql } from '../db';
import { wallTimeToUtc } from '../local-time.ts';
import { TIME_ZONE, addDays } from './availability.ts';
import { clashesFor } from './availability-data';
import { lockBookings } from './booking-lock';
import { getRehearsalSettings } from './settings';
import { sendAdminCancelledEmail, sendApprovedEmail } from './emails';
import { syncSeriesStatus } from './decisions';
import type { PaymentMethod } from './decisions';

// Alex adds a rehearsal himself from the admin Calendar: a band, a day and a
// time. It goes straight in as confirmed (no request step). Future sessions
// can email the band the usual "You're on" confirmation; past ones are just a
// record, optionally marked paid there and then.
//
// Admin overrides the band-side rules: any time, any length, the turnover
// buffer and blocks don't stop it (clashes are reported back). The only hard
// stop is the DB backstop: it can't overlap another live booking.

export type PaidAs = PaymentMethod | 'comped' | null;

export interface AdminBookingInput {
  bandId: number;
  start: Date;
  end: Date;
  note: string;
  email: boolean; // send the confirmation (future sessions only)
  paid: PaidAs; // already paid (how), comped, or not yet
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAID: Array<Exclude<PaidAs, null>> = ['venmo', 'cash', 'square', 'comped'];

// { bandId, date: YYYY-MM-DD, from: HH:MM, to: HH:MM ('00:00' = midnight), note, email, paid }
export function parseAdminBooking(body: unknown): Result<AdminBookingInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const bandId = Number(b.bandId);
  if (!Number.isInteger(bandId) || bandId <= 0) return { ok: false, error: 'Pick a band.' };
  const date = String(b.date ?? '');
  if (!DATE.test(date)) return { ok: false, error: 'Pick a day.' };
  const from = String(b.from ?? '');
  const to = String(b.to ?? '');
  if (!TIME.test(from) || !TIME.test(to)) return { ok: false, error: 'Pick a start and end time.' };
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = wallTimeToUtc(date, fh, fm, TIME_ZONE);
  const end = to === '00:00' ? wallTimeToUtc(addDays(date, 1), 0, 0, TIME_ZONE) : wallTimeToUtc(date, th, tm, TIME_ZONE);
  if (end <= start) return { ok: false, error: 'The end has to be after the start.' };
  if (end.getTime() - start.getTime() > 24 * 3_600_000) return { ok: false, error: 'That’s longer than a day.' };
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) : '';
  const paid = PAID.includes(b.paid as Exclude<PaidAs, null>) ? (b.paid as Exclude<PaidAs, null>) : null;
  return { ok: true, value: { bandId, start, end, note, email: b.email === true, paid } };
}

export type AdminBookingOutcome =
  | { ok: true; id: number; catalogueId: string; emailed: boolean; past: boolean; clash: string[] }
  | { ok: false; error: string; status: number };

const REASON: Record<string, string> = {
  show: 'a show that day',
  unavailable_day: 'a Not available day',
  blackout: 'a block',
  busy: 'busy on your calendar',
};

export async function createAdminBooking(v: AdminBookingInput, now = new Date()): Promise<AdminBookingOutcome> {
  const [band] = await sql<{ id: number; gearNeeded: string[]; gearNotes: string }[]>`
    select id::int as id, default_gear_needed as "gearNeeded", default_gear_notes as "gearNotes"
    from rehearsal_bands where id = ${v.bandId}
  `;
  if (!band) return { ok: false, status: 404, error: 'That band wasn’t found.' };
  const settings = await getRehearsalSettings();
  const price = settings.paymentsEnabled ? settings.priceCents : 0;
  const method: PaymentMethod = v.paid && v.paid !== 'comped' ? v.paid : 'venmo';
  const past = v.start <= now;

  let row: { id: number; catalogueId: string };
  try {
    row = await sql.begin(async (tx) => {
      await lockBookings(tx);
      const [r] = await tx<{ id: number; catalogueId: string }[]>`
        insert into rehearsal_bookings
          (band_id, starts_at, ends_at, status, expires_at, decided_at, price_cents, payment_method,
           payment_status, payment_provider, paid_at, note, gear_needed, gear_notes)
        values
          (${band.id}, ${v.start}, ${v.end}, 'confirmed', ${now}, ${now}, ${price}, ${method},
           ${v.paid === 'comped' ? 'comped' : v.paid ? 'paid' : 'unpaid'},
           ${v.paid && v.paid !== 'comped' ? v.paid : null}, ${v.paid && v.paid !== 'comped' ? now : null},
           ${v.note}, ${band.gearNeeded}::text[], ${band.gearNotes})
        returning id::int as id, catalogue_id as "catalogueId"
      `;
      return r;
    });
  } catch (e) {
    // exclusion_violation: overlaps another pending/confirmed booking.
    if ((e as { code?: string }).code === '23P01') {
      return { ok: false, status: 409, error: 'That overlaps another booking. Pick a different time.' };
    }
    throw e;
  }

  // Heads-up only (admin can book over a block or a busy time).
  const { reasons } = past ? { reasons: new Map() } : await clashesFor([{ id: row.id, startsAt: v.start, endsAt: v.end }]);
  const clash = ((reasons.get(row.id) ?? []) as string[]).map((r) => REASON[r] ?? r);

  const emailed = v.email && !past ? await sendApprovedEmail([row.id]) : false;
  return { ok: true, id: row.id, catalogueId: row.catalogueId, emailed, past, clash };
}

// Alex cancels a confirmed rehearsal (one session; a series' other sessions
// stay). The slot frees up, any change the band asked for on it goes too, and
// the payment record is left as it was (refunds are handled by hand). Past
// sessions can be cancelled to correct the record, but never emailed.
export type AdminCancelOutcome =
  | { ok: true; emailed: boolean; past: boolean }
  | { ok: false; error: string; status: number };

export async function cancelAdminBooking(
  id: number,
  opts: { email: boolean; reason: string },
  now = new Date(),
): Promise<AdminCancelOutcome> {
  const res = await sql.begin(async (tx) => {
    const [b] = await tx<{ status: string; startsAt: Date }[]>`
      select status, starts_at as "startsAt" from rehearsal_bookings where id = ${id} for update
    `;
    if (!b) return { ok: false as const, status: 404, error: 'That booking wasn’t found.' };
    if (b.status !== 'confirmed') return { ok: false as const, status: 409, error: 'Only a confirmed booking can be cancelled.' };
    await tx`
      update rehearsal_bookings
      set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'admin', updated_at = now()
      where id = ${id}
    `;
    await tx`
      update rehearsal_bookings
      set status = 'cancelled', cancelled_at = ${now}, cancelled_by = 'admin', updated_at = now()
      where replaces_booking_id = ${id} and status = 'pending'
    `;
    return { ok: true as const, past: b.startsAt <= now };
  });
  if (!res.ok) return res;
  await syncSeriesStatus([id]);
  const emailed = opts.email && !res.past ? await sendAdminCancelledEmail(id, opts.reason) : false;
  return { ok: true, emailed, past: res.past };
}
