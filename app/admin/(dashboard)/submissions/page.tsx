import { sql } from '@/lib/db';
import SubmissionsBoard from '@/components/admin/SubmissionsBoard';
import { SUBMISSION_COLUMNS, type Submission } from '@/lib/submissions';
import { getAvailableDates } from '@/lib/available-dates';

export const dynamic = 'force-dynamic';

async function getSubmissions(): Promise<Submission[]> {
  return sql<Submission[]>`select ${sql(SUBMISSION_COLUMNS)} from submissions order by created_at desc`;
}

export default async function AdminSubmissionsPage() {
  const [submissions, availableDates] = await Promise.all([getSubmissions(), getAvailableDates()]);
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <SubmissionsBoard
        initialSubmissions={submissions}
        initialAvailableDates={availableDates}
      />
    </main>
  );
}
