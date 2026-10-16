import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { getAvailableDates } from '@/lib/available-dates';
import { feedUrl, getOrCreateFeedToken } from '@/lib/booking-feed';
import type { BookingDay, BookingProspect } from '@/lib/booking';
import BookingDashboard, {
  type BookingShow,
  type BookingDateOffer,
} from '@/components/admin/booking/BookingDashboard';

export const dynamic = 'force-dynamic';

export default async function BookingPage() {
  const today = getTodayCentral();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [prospects, days, availableDates, dateOffers, shows, feedToken] = await Promise.all([
    sql<BookingProspect[]>`
      select id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
      from booking_prospects
      order by priority desc, updated_at desc
    `,
    sql<BookingDay[]>`
      select date::text as date, title, notepad
      from booking_days
      order by date asc
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
    getOrCreateFeedToken(),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16">
      <h2 className="mb-6 mt-8 text-xl font-bold">Booking</h2>
      <BookingDashboard
        today={today}
        initialProspects={prospects}
        initialDays={days}
        initialAvailableDates={availableDates}
        dateOffers={dateOffers}
        shows={shows}
        feedUrl={feedUrl(feedToken)}
      />
    </main>
  );
}
