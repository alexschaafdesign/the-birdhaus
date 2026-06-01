import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function UpcomingShows() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const today = new Date(todayStr);

  const upcomingShows = shows.filter((show) => {
    const [year, month, day] = show.date.split('-').map(Number);
    const showDate = new Date(year, month - 1, day);
    return showDate >= today && show.announced === true;
  });
  upcomingShows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="min-h-screen">
      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16 pt-4">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-[#E8E0D0]/70 text-lg">Click a show to RSVP and get details</p>
        </div>
        {upcomingShows.length === 0 ? (
          <p className="text-[#E8E0D0]/70">No upcoming shows scheduled.</p>
        ) : (
          <div className="space-y-4">
            {upcomingShows.map((show) => (
              <Link
                key={show.slug}
                href={`/shows/${show.slug}`}
                className="flex items-center justify-between gap-4 border border-[#E8E0D0]/30 rounded p-5 hover:border-[#E8E0D0] hover:bg-[#E8E0D0]/5 transition-colors group"
              >
                <div className="flex-1">
                  <p className="text-[#E8E0D0]/50 text-sm mb-1">{show.date}</p>
                  <h3 className="text-2xl font-bold">{show.title}</h3>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {show.flyer && (
                    <img
                      src={show.flyer}
                      alt={`${show.title} flyer`}
                      className="w-14 h-14 object-cover rounded"
                    />
                  )}
                  <span className="text-sm text-[#E8E0D0]/50 group-hover:text-[#E8E0D0] transition-colors">RSVP →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-[#E8E0D0]/70">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}
