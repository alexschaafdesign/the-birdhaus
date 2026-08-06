// Pure timesheet types + math, safe to import from client components (no db /
// postgres driver). lib/timesheet.ts (the raw-SQL data layer) re-uses these.

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
