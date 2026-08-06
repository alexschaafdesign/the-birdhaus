// Timesheet — hourly entries logged by admin helpers (migration 042). Raw-SQL
// data layer, same shape/conventions as lib/song-club.ts. Money is stored as
// integer cents (rate_cents); hours are derived from clock_in/clock_out at read
// time so an edited rate always recomputes the payout cleanly.

import { sql } from './db';

// Mirrors the `timesheet_entries` columns (snake_case), with hours + payout
// derived. clock_in/clock_out come back as "HH:MM:SS" text.
export interface TimesheetEntry {
  id: number;
  worker_name: string;
  work_date: string; // "YYYY-MM-DD"
  clock_in: string; // "HH:MM:SS"
  clock_out: string; // "HH:MM:SS"
  rate_cents: number;
  note: string | null;
  paid: boolean;
  paid_date: string | null; // "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
  // Derived (not columns):
  hours: number; // decimal hours, midnight-wrap aware
  payout: number; // dollars, hours * rate
}

// The shape the admin form posts / the API layer accepts.
export interface TimesheetEntryInput {
  workerName: string;
  workDate: string; // "YYYY-MM-DD"
  clockIn: string; // "HH:MM" or "HH:MM:SS"
  clockOut: string; // "HH:MM" or "HH:MM:SS"
  rateCents: number;
  note: string | null;
}

const COLUMNS = sql`
  id, worker_name, work_date::text as work_date, clock_in::text as clock_in,
  clock_out::text as clock_out, rate_cents, note, paid, paid_date::text as paid_date,
  created_at, updated_at
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const DEFAULT_RATE_CENTS = 2000; // $20/hr, the current helper rate

// Minutes since midnight for a "HH:MM[:SS]" string.
function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Decimal hours between clock_in and clock_out. A clock_out at or before
// clock_in is treated as the next day (a shift crossing midnight), matching the
// spreadsheet row like 12:40 AM -> 1:00 AM.
export function computeHours(clockIn: string, clockOut: string): number {
  let mins = minutesOf(clockOut) - minutesOf(clockIn);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// Payout in dollars, rounded to cents.
export function computePayout(hours: number, rateCents: number): number {
  return Math.round(hours * rateCents) / 100;
}

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
