// Timesheet — hourly entries logged by admin helpers (migration 042). Raw-SQL
// data layer, same shape/conventions as lib/song-club.ts. Money is stored as
// integer cents (rate_cents); hours are derived from clock_in/clock_out at read
// time so an edited rate always recomputes the payout cleanly. Pure types +
// math live in ./timesheet-shared so client components can import them without
// pulling in the postgres driver.

import { sql } from './db';
import {
  DEFAULT_RATE_CENTS,
  computeHours,
  computePayout,
  type TimesheetEntry,
  type TimesheetEntryInput,
} from './timesheet-shared';

export {
  DEFAULT_RATE_CENTS,
  computeHours,
  computePayout,
  type TimesheetEntry,
  type TimesheetEntryInput,
};

const COLUMNS = sql`
  id, worker_name, work_date::text as work_date, clock_in::text as clock_in,
  clock_out::text as clock_out, rate_cents, note, paid, paid_date::text as paid_date,
  created_at, updated_at
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function decorate(row: Omit<TimesheetEntry, 'hours' | 'payout'>): TimesheetEntry {
  const hours = computeHours(row.clock_in, row.clock_out);
  return { ...row, hours, payout: computePayout(hours, row.rate_cents) };
}

// Validates + normalizes a raw JSON body into a TimesheetEntryInput, or returns
// an { error } the API layer turns into a 400.
export interface TimesheetEntryBody {
  workerName?: unknown;
  workDate?: unknown;
  clockIn?: unknown;
  clockOut?: unknown;
  rateCents?: unknown;
  note?: unknown;
}

export function buildEntryInput(body: TimesheetEntryBody): TimesheetEntryInput | { error: string } {
  const workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
  if (!workerName) return { error: 'Who worked is required.' };

  const workDate = typeof body.workDate === 'string' ? body.workDate : '';
  if (!ISO_DATE_RE.test(workDate)) return { error: 'A valid date is required.' };

  const clockIn = typeof body.clockIn === 'string' ? body.clockIn : '';
  const clockOut = typeof body.clockOut === 'string' ? body.clockOut : '';
  if (!TIME_RE.test(clockIn)) return { error: 'A valid clock-in time is required.' };
  if (!TIME_RE.test(clockOut)) return { error: 'A valid clock-out time is required.' };

  const rateCents =
    typeof body.rateCents === 'number' && Number.isFinite(body.rateCents)
      ? Math.round(body.rateCents)
      : DEFAULT_RATE_CENTS;
  if (rateCents < 0) return { error: 'Rate cannot be negative.' };

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  return { workerName, workDate, clockIn, clockOut, rateCents, note };
}

// All entries, most recent work first.
export async function listEntries(): Promise<TimesheetEntry[]> {
  const rows = await sql<Omit<TimesheetEntry, 'hours' | 'payout'>[]>`
    select ${COLUMNS} from timesheet_entries
    order by work_date desc, clock_in desc, id desc
  `;
  return rows.map(decorate);
}

export async function createEntry(input: TimesheetEntryInput): Promise<TimesheetEntry> {
  const [row] = await sql<Omit<TimesheetEntry, 'hours' | 'payout'>[]>`
    insert into timesheet_entries
      (worker_name, work_date, clock_in, clock_out, rate_cents, note)
    values
      (${input.workerName}, ${input.workDate}, ${input.clockIn}, ${input.clockOut},
       ${input.rateCents}, ${input.note})
    returning ${COLUMNS}
  `;
  return decorate(row);
}

export async function updateEntry(
  id: number,
  input: TimesheetEntryInput
): Promise<TimesheetEntry | null> {
  const [row] = await sql<Omit<TimesheetEntry, 'hours' | 'payout'>[]>`
    update timesheet_entries set
      worker_name = ${input.workerName},
      work_date = ${input.workDate},
      clock_in = ${input.clockIn},
      clock_out = ${input.clockOut},
      rate_cents = ${input.rateCents},
      note = ${input.note},
      updated_at = now()
    where id = ${id}
    returning ${COLUMNS}
  `;
  return row ? decorate(row) : null;
}

// Toggles paid state. Marking paid stamps paid_date (defaults to today Central
// if not supplied); un-paying clears it. paid_date drives the tax-year rollup.
export async function setPaid(
  id: number,
  paid: boolean,
  paidDate?: string | null
): Promise<TimesheetEntry | null> {
  const nextPaidDate = paid ? (paidDate && ISO_DATE_RE.test(paidDate) ? paidDate : getTodayCentral()) : null;
  const [row] = await sql<Omit<TimesheetEntry, 'hours' | 'payout'>[]>`
    update timesheet_entries set
      paid = ${paid},
      paid_date = ${nextPaidDate},
      updated_at = now()
    where id = ${id}
    returning ${COLUMNS}
  `;
  return row ? decorate(row) : null;
}

export async function deleteEntry(id: number): Promise<boolean> {
  const result = await sql`delete from timesheet_entries where id = ${id}`;
  return result.count > 0;
}

// Today in Central Time as "YYYY-MM-DD" (same convention as lib/song-club).
export function getTodayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Unpaid entries whose work happened more than `days` ago, oldest first — the
// weekly "you still owe for these" reminder (app/api/cron/timesheet-unpaid).
export async function listUnpaidOlderThan(days: number): Promise<TimesheetEntry[]> {
  const rows = await sql<Omit<TimesheetEntry, 'hours' | 'payout'>[]>`
    select ${COLUMNS} from timesheet_entries
    where paid = false and work_date < (current_date - ${days}::int)
    order by work_date asc, clock_in asc
  `;
  return rows.map(decorate);
}

// Total paid to each worker within a paid_date range, for the Settlements
// yearly rollup. Cash-basis: only paid entries, keyed on when they were paid.
// Returns dollars.
export async function paidTotalsByWorker(
  rangeStart: string,
  rangeEnd: string
): Promise<{ name: string; amount: number }[]> {
  const rows = await sql<{ worker_name: string; cents: string }[]>`
    select worker_name,
           sum(round(
             (extract(epoch from (
                case when clock_out <= clock_in then clock_out + interval '24 hours' else clock_out end
              ) - clock_in) / 3600.0) * rate_cents
           ))::bigint as cents
    from timesheet_entries
    where paid = true and paid_date >= ${rangeStart} and paid_date <= ${rangeEnd}
    group by worker_name
    order by worker_name
  `;
  return rows.map((r) => ({ name: r.worker_name, amount: Number(r.cents) / 100 }));
}
