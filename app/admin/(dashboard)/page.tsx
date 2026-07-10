import { sql } from '@/lib/db';
import SubmissionsBoard from '@/components/admin/SubmissionsBoard';
import type { Submission } from '@/lib/submissions';
import type { AvailableDate } from '@/lib/available-dates';

export const dynamic = 'force-dynamic';

async function getSubmissions(): Promise<Submission[]> {
  const rows = await sql<Submission[]>`select * from submissions order by created_at desc`;
  return rows;
}

async function getAvailableDates(): Promise<AvailableDate[]> {
  const rows = await sql<
    AvailableDate[]
  >`select id, date::text as date, created_at from available_dates order by date asc`;
  return rows;
}

export default async function AdminPage() {
  const [submissions, availableDates] = await Promise.all([getSubmissions(), getAvailableDates()]);
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16">
      <SubmissionsBoard initialSubmissions={submissions} initialAvailableDates={availableDates} />
    </main>
  );
}
