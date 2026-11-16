import { sql } from '@/lib/db';
import SubmissionsBoard from '@/components/admin/SubmissionsBoard';
import { SUBMISSION_COLUMNS, type Submission } from '@/lib/submissions';
import { getAvailableDates } from '@/lib/available-dates';
import type { DateOffer } from '@/lib/date-offers';

export const dynamic = 'force-dynamic';

async function getSubmissions(): Promise<Submission[]> {
  return sql<Submission[]>`select ${sql(SUBMISSION_COLUMNS)} from submissions order by created_at desc`;
}

async function getDateOffers(): Promise<DateOffer[]> {
  return sql<
    DateOffer[]
  >`select id, submission_id, date::text as date, status, created_at, updated_at from submission_date_offers order by date asc`;
}

export default async function AdminSubmissionsPage() {
  const [submissions, availableDates, dateOffers] = await Promise.all([
    getSubmissions(),
    getAvailableDates(),
    getDateOffers(),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <SubmissionsBoard
        initialSubmissions={submissions}
        initialAvailableDates={availableDates}
        initialDateOffers={dateOffers}
      />
    </main>
  );
}
