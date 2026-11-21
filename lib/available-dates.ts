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
// soonest first. Any show on the date counts, announced or not. Private: only
// the home page's admin preview reads this, linking each one to a new show.
// Don't render it on a public page.
export async function getOpenDates(fromDate: string): Promise<string[]> {
  const rows = await sql<Array<{ date: string }>>`
    select a.date::text as date
    from available_dates a
    where a.date >= ${fromDate}::date
      and not exists (select 1 from shows s where s.date = a.date)
      -- a block covering the whole day (see lib/rehearsal/blackouts.ts)
      and not exists (
        select 1 from rehearsal_blackouts b
        where b.starts_at <= (a.date::timestamp at time zone 'America/Chicago')
          and b.ends_at >= ((a.date + 1)::timestamp at time zone 'America/Chicago')
      )
    order by a.date asc
  `;
  return rows.map((r) => r.date);
}
