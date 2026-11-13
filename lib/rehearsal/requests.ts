import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { getRehearsalSettings } from './settings';
import { loadAvailability } from './availability-data';
import { isOpenBlock } from './availability.ts';
import { MAX_SESSIONS_PER_REQUEST, canBandCancel, planRequest, type ParsedRequest } from './request-rules.ts';
import { describeRule, type Freq } from './series.ts';
import { chicagoDate } from './availability.ts';

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
  repeatLabel: string | null; // "Weekly on Wednesdays" when part of a series
}

// The band's bookings that haven't ended (plus anything that ended in the
// last day, so a just-finished session doesn't vanish mid-evening).
export async function listBandBookings(bandId: number): Promise<BandBooking[]> {
  return sql<BandBooking[]>`
    select id::int as id, catalogue_id as "catalogueId", starts_at as "startsAt", ends_at as "endsAt",
           status, price_cents as "priceCents", note, gear_needed as "gearNeeded", gear_notes as "gearNotes",
           decline_reason as "declineReason", expires_at as "expiresAt",
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

  // Same planner the booking page previews with, so the band's total matches.
  const plan = planRequest(req.items, (d) => isOpenBlock(availability, d), availability.windowEnd);
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
  const blockMs = settings.blockMinutes * 60_000;
  const repeatPrice = settings.repeatPriceCents ?? settings.priceCents;

  try {
    const catalogueIds = await sql.begin(async (tx) => {
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
             ${req.items[i].start}, ${settings.blockMinutes}, ${repeatPrice}, ${requestKey})
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
            (${bandId}, ${x.start}, ${new Date(x.start.getTime() + blockMs)}, 'pending', ${expiresAt},
             ${x.repeat ? repeatPrice : settings.priceCents}, ${req.paymentMethod}, ${req.note}, ${req.gearNeeded}::text[],
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
