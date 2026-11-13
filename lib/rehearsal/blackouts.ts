import { sql } from '../db';
import { wallTimeToUtc } from '../local-time.ts';
import { TIME_ZONE, addDays } from './availability.ts';
import { bookingsByIds, type AdminBooking } from './decisions';

// Manual rehearsal blackouts (admin Calendar). Adding one over a confirmed
// booking flags that booking as a conflict, never cancels it; Alex sees the
// warning right there, so it's also marked as already told.

export interface Blackout {
  id: number;
  start: Date;
  end: Date;
  note: string;
}

export async function listBlackouts(from: Date, to: Date): Promise<Blackout[]> {
  return sql<Blackout[]>`
    select id::int as id, starts_at as start, ends_at as "end", note
    from rehearsal_blackouts
    where ends_at > ${from} and starts_at < ${to}
    order by starts_at
  `;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// { fromDate, toDate, allDay, fromTime, toTime, note } -> instants (Chicago).
export function parseBlackout(body: unknown): Result<{ start: Date; end: Date; note: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const fromDate = String(b.fromDate ?? '');
  const toDate = String(b.toDate || fromDate);
  if (!DATE.test(fromDate) || !DATE.test(toDate)) return { ok: false, error: 'Pick the dates.' };
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
  let start: Date;
  let end: Date;
  if (b.allDay !== false) {
    start = wallTimeToUtc(fromDate, 0, 0, TIME_ZONE);
    end = wallTimeToUtc(addDays(toDate, 1), 0, 0, TIME_ZONE);
  } else {
    const ft = String(b.fromTime ?? '');
    const tt = String(b.toTime ?? '');
    if (!TIME.test(ft) || !TIME.test(tt)) return { ok: false, error: 'Pick a start and end time.' };
    const [fh, fm] = ft.split(':').map(Number);
    const [th, tm] = tt.split(':').map(Number);
    start = wallTimeToUtc(fromDate, fh, fm, TIME_ZONE);
    end = wallTimeToUtc(toDate, th, tm, TIME_ZONE);
  }
  if (end <= start) return { ok: false, error: 'The end has to be after the start.' };
  if (end.getTime() - start.getTime() > 366 * 86_400_000) return { ok: false, error: 'That’s longer than a year.' };
  return { ok: true, value: { start, end, note } };
}

// Creates the blackout; returns confirmed bookings it now overlaps (flagged).
export async function createBlackout(v: { start: Date; end: Date; note: string }): Promise<AdminBooking[]> {
  const ids = await sql.begin(async (tx) => {
    await tx`insert into rehearsal_blackouts (starts_at, ends_at, note) values (${v.start}, ${v.end}, ${v.note})`;
    const rows = await tx<{ id: number }[]>`
      update rehearsal_bookings
      set conflict = true,
          conflict_reason = case when conflict_reason = '' then 'blackout' else conflict_reason end,
          conflict_flagged_at = coalesce(conflict_flagged_at, now()),
          conflict_notified_at = coalesce(conflict_notified_at, now()),
          updated_at = now()
      where status = 'confirmed' and ends_at > now() and starts_at < ${v.end} and ends_at > ${v.start}
      returning id::int as id
    `;
    return rows.map((r) => r.id);
  });
  return bookingsByIds(ids);
}

// Removing a blackout doesn't clear flags by itself: the daily job re-checks
// everything and clears flags that no longer apply.
export async function deleteBlackout(id: number): Promise<boolean> {
  const rows = await sql`delete from rehearsal_blackouts where id = ${id} returning id`;
  return rows.length > 0;
}
