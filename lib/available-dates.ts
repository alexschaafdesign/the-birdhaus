import { sql } from './db';

export interface AvailableDate {
  id: number;
  date: string;
  created_at: string;
}

export async function getAvailableDates(): Promise<AvailableDate[]> {
  return sql<AvailableDate[]>`select id, date::text as date, created_at from available_dates order by date asc`;
}

// Dates marked available (the booking dashboard's "mark available" toggle)
// from `fromDate` on that don't already have a show, as "YYYY-MM-DD",
// soonest first. Any show on the date counts, announced or not. Public on
// /contact; the home page's admin preview links each one to a new show.
export async function getOpenDates(fromDate: string): Promise<string[]> {
  const rows = await sql<Array<{ date: string }>>`
    select a.date::text as date
    from available_dates a
    where a.date >= ${fromDate}::date
      and not exists (select 1 from shows s where s.date = a.date)
    order by a.date asc
  `;
  return rows.map((r) => r.date);
}
