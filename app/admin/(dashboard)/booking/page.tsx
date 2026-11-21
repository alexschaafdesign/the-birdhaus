import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { getAvailableDates } from '@/lib/available-dates';
import { feedUrl, getOrCreateFeedToken } from '@/lib/booking-feed';
import { blockedDays } from '@/lib/rehearsal/blackouts';
import { addDays } from '@/lib/rehearsal/availability';
import type { BookingDay, BookingProspect } from '@/lib/booking';
import { PageHeader } from '@/components/admin/ui';
import BookingDashboard, {
  type BookingShow,
  type BookingDateOffer,
} from '@/components/admin/booking/BookingDashboard';

export const dynamic = 'force-dynamic';

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const today = getTodayCentral();
  const { date } = await searchParams;
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [prospects, days, availableDates, dateOffers, shows, feedToken, blocked] = await Promise.all([
    sql<BookingProspect[]>`
      select id, band_id, name, status, priority, last_contacted_at, notes, created_at, updated_at
      from booking_prospects
      order by priority desc, updated_at desc
    `,
    sql<BookingDay[]>`
      select date::text as date, title, notepad
      from booking_days
      where title <> '' or notepad <> ''
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
    // Whole days covered by a block (managed on the master Calendar), read-only here.
    blockedDays(yearStart, addDays(today, 2 * 366)),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <PageHeader overline="Shows" title="Booking" />
      <BookingDashboard
        today={today}
        initialProspects={prospects}
        initialDays={days}
        initialAvailableDates={availableDates}
        dateOffers={dateOffers}
        shows={shows}
        feedUrl={feedUrl(feedToken)}
        initialDate={initialDate}
        blockedDays={Object.fromEntries(blocked)}
      />
    </main>
  );
}
