import { sql } from './db';

export interface AvailableDate {
  id: number;
  date: string;
  created_at: string;
}

export async function getAvailableDates(): Promise<AvailableDate[]> {
  return sql<AvailableDate[]>`select id, date::text as date, created_at from available_dates order by date asc`;
}
