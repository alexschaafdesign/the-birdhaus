import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function Home() {
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

  const pastShows = shows.filter((show) => {
    const [year, month, day] = show.date.split('-').map(Number);
    return new Date(year, month - 1, day) < today;
  });

  const bandCounts = new Map<string, number>();
  for (const show of pastShows) {
    for (const band of show.bands) {
      const name = typeof band === 'string' ? band : band.name;
      bandCounts.set(name, (bandCounts.get(name) ?? 0) + 1);
    }
  }
  const sortedBands = Array.from(bandCounts.entries()).sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  );

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Logo and Title */}
      <div className="pt-12 pb-8 px-8">
        <div className="flex flex-col items-center justify-center gap-4 mb-4">
          <img 
            src="https://res.cloudinary.com/defdv9zw7/image/upload/v1777667646/BHR_LOGO_-_THE_BIRDHAUS_horizontal_1_zr5a8s.svg"
            alt="The Birdhaus"
            className="w-full max-w-sm h-auto"
          />
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-sm mb-4">
          <a href="#upcoming-shows" className="hover:underline">Upcoming Shows</a>
          <span className="hidden md:inline">•</span>
          <a href="/archive" className="hover:underline text-center">Archive</a>
          <span className="hidden md:inline">•</span>
          <a href="/videos" className="hover:underline">Video</a>
          <span className="hidden md:inline">•</span>
          <a href="/contact" className="hover:underline">Contact</a>
        </div>
      </div>

      {/* About */}
      <div className="max-w-4xl mx-auto px-8 mb-8">
        <p className="text-lg md:text-xl text-gray-600 text-center">
          the BIRDHAUS is a DIY house venue located in Powderhorn, Minneapolis
        </p>
      </div>

      {/* Band Roster */}
      {sortedBands.length > 0 && (
        <div className="max-w-4xl mx-auto px-8 mb-12">
          <details className="rounded-lg group bg-gray-100">
            <summary className="px-5 py-4 cursor-pointer select-none list-none flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-bold">BIRDHAUS alums</span>
                <span className="text-gray-500 text-sm">{sortedBands.length} bands and counting</span>
              </div>
              <span className="text-xs uppercase tracking-widest text-gray-400 group-open:hidden">Show ▸</span>
              <span className="text-xs uppercase tracking-widest text-gray-400 hidden group-open:inline">Hide ▾</span>
            </summary>
            <div className="px-5 pb-5 pt-3 border-t border-gray-200 columns-2 sm:columns-3 gap-x-6">
              {sortedBands.map(([name, count]) => (
                <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-gray-200 break-inside-avoid">
                  <span className="text-sm text-gray-800">{name}</span>
                  {count > 1 && (
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">×{count}</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Hero Image */}
      <div className="w-full max-w-6xl mx-auto px-8 mb-12">
        <img 
          src="https://res.cloudinary.com/defdv9zw7/image/upload/v1771535212/IMG_7246_vdubka.jpg"
          alt="The Birdhaus venue"
          className="w-full h-auto rounded-lg mb-2"
        />
        <p className="text-sm text-gray-600 text-center">Mary Jam on 1/23/26 - Photo by Sabrina Rose</p>
      </div>

      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-gray-600 text-lg">Click a show to RSVP and get details</p>
        </div>        
        {upcomingShows.length === 0 ? (
          <p className="text-gray-600">No upcoming shows scheduled.</p>
        ) : (
          <div className="space-y-4">
            {upcomingShows.map((show) => (
              <Link 
                key={show.slug} 
                href={`/shows/${show.slug}`}
                className="flex items-center justify-between gap-4 border border-gray-300 rounded p-5 hover:border-black hover:bg-gray-50 transition-colors group"
              >
                <div className="flex-1">
                  <p className="text-gray-500 text-sm mb-1">{show.date}</p>
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
                  <span className="text-sm text-gray-400 group-hover:text-black transition-colors">RSVP →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-gray-600">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}