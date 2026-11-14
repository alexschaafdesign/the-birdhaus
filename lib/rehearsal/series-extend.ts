import { sql } from '../db';
import { loadAvailability } from './availability-data';
import { chicagoDate, spanFits } from './availability.ts';
import { bufferClash, lockBookings } from './booking-lock';
import { occurrenceStarts, type Freq, type SeriesRule } from './series.ts';

// Approved series keep going past the booking window. Each daily run (and
// approving a series) books the dates that have come into the window as
// confirmed, with no re-approval, and records the ones it had to skip
// (a show, Not-available day, blackout, busy time or another booking) in
// rehearsal_series_skips so they're never retried or re-notified.
// A date a series already has a row for (any status: e.g. the band cancelled
// it) is left alone.

export interface Extension {
  booked: Array<{ seriesId: number; bandId: number; start: Date; catalogueId: string }>;
  skipped: Array<{ seriesId: number; bandId: number; start: Date }>;
}

interface SeriesRow {
  id: number;
  bandId: number;
  freq: Freq;
  untilDate: string | null;
  occurrences: number | null;
  endsOn: string | null;
  anchor: Date;
  blockMinutes: number;
  priceCents: number;
  paymentMethod: string;
  gearNeeded: string[];
  gearNotes: string;
  requestKey: string | null;
}

export async function extendSeries(opts: { now?: Date; seriesIds?: number[] } = {}): Promise<Extension> {
  const now = opts.now ?? new Date();
  const out: Extension = { booked: [], skipped: [] };
  const series = await sql<SeriesRow[]>`
    select id::int as id, band_id::int as "bandId", freq, until_date::text as "untilDate", occurrences,
           ends_on::text as "endsOn", anchor_starts_at as anchor, block_minutes as "blockMinutes",
           price_cents as "priceCents", payment_method as "paymentMethod",
           gear_needed as "gearNeeded", gear_notes as "gearNotes", request_key as "requestKey"
    from rehearsal_series
    where status = 'confirmed' and ended_at is null and anchor_starts_at is not null
      ${opts.seriesIds ? sql`and id in ${sql(opts.seriesIds.length ? opts.seriesIds : [0])}` : sql``}
  `;
  if (series.length === 0) return out;

  // One availability computation for everyone (admin view: every booking,
  // including the band's own, counts as taken).
  const { availability, settings } = await loadAvailability({ now });
  const windowStart = availability.windowStart;
  const lastDate = chicagoDate(availability.windowEnd);

  for (const s of series) {
    const rule: SeriesRule = {
      freq: s.freq,
      ...(s.untilDate ? { until: s.untilDate } : {}),
      ...(s.occurrences ? { count: s.occurrences } : {}),
    };
    const known = new Set(
      (
        await sql<{ t: Date }[]>`
          select starts_at as t from rehearsal_bookings where series_id = ${s.id}
          union
          select starts_at as t from rehearsal_series_skips where series_id = ${s.id}
        `
      ).map((r) => r.t.getTime()),
    );
    const candidates = occurrenceStarts(s.anchor, rule, lastDate).filter(
      (d) =>
        // Only dates that are in the window now: earlier ones were handled
        // when the series was requested (or are too close to add).
        d >= windowStart &&
        d < availability.windowEnd &&
        !known.has(d.getTime()) &&
        (!s.endsOn || chicagoDate(d) < s.endsOn),
    );

    for (const start of candidates) {
      if (!spanFits(availability, start, s.blockMinutes)) {
        await skip(s, start, out);
        continue;
      }
      const end = new Date(start.getTime() + s.blockMinutes * 60_000);
      try {
        const row = await sql.begin(async (tx) => {
          // Under the bookings lock, re-check the buffer against everything
          // booked since the availability snapshot (other series in this run,
          // band requests).
          await lockBookings(tx);
          if (await bufferClash(tx, start, end, settings.bufferMinutes, now)) return null;
          const [r] = await tx<{ catalogueId: string }[]>`
          insert into rehearsal_bookings
            (band_id, starts_at, ends_at, status, expires_at, decided_at, price_cents, payment_method,
             note, gear_needed, gear_notes, request_key, series_id, band_emailed_at)
          values
            (${s.bandId}, ${start}, ${end}, 'confirmed', ${now}, ${now},
             ${s.priceCents}, ${s.paymentMethod}, '', ${s.gearNeeded}::text[], ${s.gearNotes},
             ${s.requestKey}, ${s.id}, ${now})
          returning catalogue_id as "catalogueId"
          `;
          return r;
        });
        if (!row) {
          await skip(s, start, out);
          continue;
        }
        out.booked.push({ seriesId: s.id, bandId: s.bandId, start, catalogueId: row.catalogueId });
      } catch (e) {
        // Lost a race for the block (another series in this run, or a request).
        if ((e as { code?: string }).code === '23P01') await skip(s, start, out);
        else throw e;
      }
    }
  }
  return out;
}

async function skip(s: SeriesRow, start: Date, out: Extension) {
  await sql`
    insert into rehearsal_series_skips (series_id, starts_at) values (${s.id}, ${start})
    on conflict do nothing
  `;
  out.skipped.push({ seriesId: s.id, bandId: s.bandId, start });
}

// --- ending a series ---------------------------------------------------------

export type EndOutcome = { ok: true; cancelled: number; endsOn: string } | { ok: false; error: string; status: number };

// Ends a series from a date: no sessions on or after it (pending and
// confirmed ones from then on are cancelled); earlier ones stay. Bands must
// respect the cancel cutoff (checked by the caller); Alex can end any time.
export async function endSeries(
  seriesId: number,
  from: Date,
  by: 'band' | 'admin',
  opts: { bandId?: number; now?: Date } = {},
): Promise<EndOutcome> {
  const now = opts.now ?? new Date();
  const endsOn = chicagoDate(from);
  return sql.begin(async (tx) => {
    const [s] = await tx<{ id: number; bandId: number; status: string }[]>`
      select id::int as id, band_id::int as "bandId", status from rehearsal_series where id = ${seriesId} for update
    `;
    if (!s || (opts.bandId !== undefined && s.bandId !== opts.bandId)) {
      return { ok: false as const, status: 404, error: 'That series wasn’t found.' };
    }
    if (s.status === 'ended' || s.status === 'declined' || s.status === 'cancelled' || s.status === 'expired') {
      return { ok: false as const, status: 409, error: 'That series has already stopped.' };
    }
    const cancelled = await tx`
      update rehearsal_bookings
      set status = 'cancelled', cancelled_at = ${now}, cancelled_by = ${by}, updated_at = now()
      where series_id = ${seriesId} and status in ('pending', 'confirmed') and starts_at >= ${from}
      returning id
    `;
    // Ending from the very first upcoming session with nothing confirmed left
    // reads the same in admin: 'ended'.
    await tx`
      update rehearsal_series
      set ends_on = ${endsOn}::date, ended_at = ${now}, ended_by = ${by}, status = 'ended', updated_at = now()
      where id = ${seriesId}
    `;
    return { ok: true as const, cancelled: cancelled.length, endsOn };
  });
}



// --- a band's series (booking page + admin band page) ---------------------------

export interface BandSeries {
  id: number;
  freq: Freq;
  rule: SeriesRule;
  anchor: Date;
  status: string;
  endsOn: string | null;
  upcoming: Date[]; // pending/confirmed sessions still to come
}

export async function listBandSeries(bandId: number, now = new Date()): Promise<BandSeries[]> {
  const rows = await sql<
    Array<{ id: number; freq: Freq; untilDate: string | null; occurrences: number | null; anchor: Date; status: string; endsOn: string | null; upcoming: Date[] | null }>
  >`
    select s.id::int as id, s.freq, s.until_date::text as "untilDate", s.occurrences, s.anchor_starts_at as anchor,
           s.status, s.ends_on::text as "endsOn",
           (select array_agg(b.starts_at order by b.starts_at) from rehearsal_bookings b
             where b.series_id = s.id and b.status in ('pending', 'confirmed') and b.starts_at > ${now}) as upcoming
    from rehearsal_series s
    where s.band_id = ${bandId} and s.anchor_starts_at is not null
      and (s.status in ('pending', 'confirmed') or s.ended_at > ${now} - interval '30 days')
    order by s.anchor_starts_at
  `;
  return rows.map((r) => ({
    id: r.id,
    freq: r.freq,
    rule: { freq: r.freq, ...(r.untilDate ? { until: r.untilDate } : {}), ...(r.occurrences ? { count: r.occurrences } : {}) },
    anchor: r.anchor,
    status: r.status,
    endsOn: r.endsOn,
    upcoming: (r.upcoming ?? []).map((d) => new Date(d)),
  }));
}

// Can a band end this series from `fromDate` (Chicago date)? Every session it
// would cancel must be outside the cancel cutoff.
export function bandMayEndFrom(upcoming: Date[], fromStart: Date, now: Date, cutoffHours: number): boolean {
  const limit = now.getTime() + cutoffHours * 3_600_000;
  return upcoming.filter((d) => d >= fromStart).every((d) => d.getTime() >= limit);
}
