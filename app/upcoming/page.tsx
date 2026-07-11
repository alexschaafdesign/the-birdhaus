import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAvailableDates } from '@/lib/available-dates';
import { isAdminSession } from '@/lib/admin-session';
import ShowsBrowser from '@/components/ShowsBrowser';

// Evaluate the upcoming/past split per request so it reflects the current date,
// not the date the site was last built/deployed.
export const dynamic = 'force-dynamic';

export default async function UpcomingShows() {
  const shows = await getAllShows();

  const today = getTodayCentral();

  const upcomingShows = shows.filter(
    (show) => show.date >= today && show.announced === true
  );
  upcomingShows.sort((a, b) => a.date.localeCompare(b.date));

  // The calendar view doubles as a navigable archive, so it includes past shows
  // (regardless of announced status, since they already happened) alongside
  // announced upcoming ones.
  const calendarShows = shows.filter((show) => show.date < today || show.announced === true);
  calendarShows.sort((a, b) => a.date.localeCompare(b.date));

  const isAdmin = await isAdminSession();

  // Admin-only overlay: unannounced future shows and open booking dates, so the
  // real calendar doubles as a planning view instead of a separate dashboard.
  let draftShows: typeof shows | undefined;
  let availableDates: string[] | undefined;
  if (isAdmin) {
    draftShows = shows.filter((show) => show.date >= today && show.announced !== true);

    const datesWithShows = new Set(shows.map((show) => show.date));
    availableDates = (await getAvailableDates())
      .map((d) => d.date)
      .filter((date) => date >= today && !datesWithShows.has(date));
  }

  return (
    <main className="min-h-screen">
      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16 pt-4">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-[#E8E0D0]/70 text-lg">Click a show to RSVP and get details</p>
        </div>
        <ShowsBrowser
          upcomingShows={upcomingShows}
          calendarShows={calendarShows}
          today={today}
          draftShows={draftShows}
          availableDates={availableDates}
          isAdmin={isAdmin}
        />

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-[#E8E0D0]/70">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}
