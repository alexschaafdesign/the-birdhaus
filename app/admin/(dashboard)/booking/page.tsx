import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { getAvailableDates } from '@/lib/available-dates';
import type { BookingProspect, DateHold, DateNote } from '@/lib/booking';
import BookingDashboard, {
  type BookingShow,
  type BookingDateOffer,
} from '@/components/admin/booking/BookingDashboard';

export const dynamic = 'force-dynamic';

export default async function BookingPage() {
  const today = getTodayCentral();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [prospects, holds, dateNotes, availableDates, dateOffers, shows] = await Promise.all([
    sql<BookingProspect[]>`
      select id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
      from booking_prospects
      order by priority desc, updated_at desc
    `,
    sql<DateHold[]>`
      select id, date::text as date, prospect_id, position, status, note, show_id, created_at, updated_at
      from date_holds
      order by date asc, position asc
    `,
    sql<DateNote[]>`
      select id, date::text as date, body, created_at, updated_at
      from date_notes
      order by date asc, created_at asc
    `,
    getAvailableDates(),
    // Inbound submissions desk overlay (read-only here): what's already been
    // offered to whom, so a night never gets promised twice.
    sql<BookingDateOffer[]>`
      select o.id, o.submission_id, o.date::text as date, o.status, s.band_name
      from submission_date_offers o
      join submissions s on s.id = o.submission_id
      order by o.date asc
    `,
    // Current-year-forward is plenty for planning; keeps the payload lean.
    sql<BookingShow[]>`
      select id, slug, title, date::text as date, announced
      from shows
      where date >= ${yearStart}
      order by date asc
    `,
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16">
      <h2 className="mb-6 mt-8 text-xl font-bold">Booking</h2>
      <BookingDashboard
        today={today}
        initialProspects={prospects}
        initialHolds={holds}
        initialDateNotes={dateNotes}
        initialAvailableDates={availableDates}
        dateOffers={dateOffers}
        shows={shows}
      />
    </main>
  );
}
