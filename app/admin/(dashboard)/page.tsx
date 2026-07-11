import { sql } from '@/lib/db';
import SubmissionsBoard from '@/components/admin/SubmissionsBoard';
import type { Submission } from '@/lib/submissions';
import { getAvailableDates } from '@/lib/available-dates';
import type { DateOffer } from '@/lib/date-offers';

export const dynamic = 'force-dynamic';

async function getSubmissions(): Promise<Submission[]> {
  return sql<Submission[]>`select * from submissions order by created_at desc`;
}

async function getDateOffers(): Promise<DateOffer[]> {
  return sql<
    DateOffer[]
  >`select id, submission_id, date::text as date, status, created_at, updated_at from submission_date_offers order by date asc`;
}

export default async function AdminPage() {
  const [submissions, availableDates, dateOffers] = await Promise.all([
    getSubmissions(),
    getAvailableDates(),
    getDateOffers(),
  ]);
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16">
      <SubmissionsBoard
        initialSubmissions={submissions}
        initialAvailableDates={availableDates}
        initialDateOffers={dateOffers}
      />
    </main>
  );
}
