import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { getRehearsalSettings } from './settings';
import { loadAvailability } from './availability-data';
import { isOpenBlock } from './availability.ts';
import { canBandCancel, type ParsedRequest } from './request-rules.ts';

// Band-side writes: send a one-off request, cancel a booking. Every block is
// re-checked against a fresh availability computation, and the no-overlap
// constraint (migration 109) is the backstop if two bands race for a block.
// Emails to Alex/the band arrive in Phase 4.

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
}

// The band's bookings that haven't ended (plus anything that ended in the
// last day, so a just-finished session doesn't vanish mid-evening).
export async function listBandBookings(bandId: number): Promise<BandBooking[]> {
  return sql<BandBooking[]>`
    select id::int as id, catalogue_id as "catalogueId", starts_at as "startsAt", ends_at as "endsAt",
           status, price_cents as "priceCents", note, gear_needed as "gearNeeded", gear_notes as "gearNotes",
           decline_reason as "declineReason", expires_at as "expiresAt"
    from rehearsal_bookings
    where band_id = ${bandId} and ends_at > now() - interval '1 day'
    order by starts_at
  `;
}

export type RequestOutcome =
  | { ok: true; requestKey: string; catalogueIds: string[] }
  | { ok: false; error: string; status: number };

export async function createRequest(bandId: number, req: ParsedRequest, now = new Date()): Promise<RequestOutcome> {
  const settings = await getRehearsalSettings();
  const { availability } = await loadAvailability({ viewerBandId: bandId, now });

  const taken = req.starts.filter((s) => !isOpenBlock(availability, s));
  if (taken.length) {
    return {
      ok: false,
      status: 409,
      error:
        taken.length === req.starts.length && taken.length === 1
          ? 'That block isn’t open any more. The calendar has been refreshed — pick another.'
          : 'Some of those blocks aren’t open any more. The calendar has been refreshed — check your picks.',
    };
  }

  const requestKey = randomBytes(12).toString('base64url');
  const expiresAt = new Date(now.getTime() + settings.pendingExpiryDays * 86_400_000);
  const blockMs = settings.blockMinutes * 60_000;

  try {
    const catalogueIds = await sql.begin(async (tx) => {
      const ids: string[] = [];
      for (const start of req.starts) {
        const [row] = await tx<{ catalogueId: string }[]>`
          insert into rehearsal_bookings
            (band_id, starts_at, ends_at, status, expires_at, price_cents, payment_method,
             note, gear_needed, gear_notes, request_key, calendar_unchecked)
          values
            (${bandId}, ${start}, ${new Date(start.getTime() + blockMs)}, 'pending', ${expiresAt},
             ${settings.priceCents}, ${req.paymentMethod}, ${req.note}, ${req.gearNeeded}::text[],
             ${req.gearNotes}, ${requestKey}, ${!availability.calendarChecked})
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
    return { ok: true, requestKey, catalogueIds };
  } catch (e) {
    // 23P01 = exclusion_violation: another request took a block between our
    // check and the insert.
    if ((e as { code?: string }).code === '23P01') {
      return { ok: false, status: 409, error: 'Someone just requested one of those blocks. Pick another.' };
    }
    throw e;
  }
}

export type CancelOutcome = { ok: true } | { ok: false; error: string; status: number };

export async function cancelBandBooking(bandId: number, bookingId: number, now = new Date()): Promise<CancelOutcome> {
  const settings = await getRehearsalSettings();
  return sql.begin(async (tx) => {
    const [b] = await tx<{ status: BookingStatus; startsAt: Date }[]>`
      select status, starts_at as "startsAt"
      from rehearsal_bookings
      where id = ${bookingId} and band_id = ${bandId}
      for update
    `;
    if (!b) return { ok: false as const, status: 404, error: 'That booking wasn’t found.' };
    if (!canBandCancel(b, now, settings.cancelCutoffHours)) {
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
    return { ok: true as const };
  });
}
