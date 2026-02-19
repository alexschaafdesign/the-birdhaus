import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function Home() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  
  // Filter for future shows only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingShows = shows.filter((show) => new Date(show.date) >= today);
  
  // Sort by date, soonest first
  upcomingShows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Logo and Title */}
        <div className="pt-12 pb-8 px-8">
          <div className="flex flex-col items-center justify-center gap-4 mb-4">
            <img 
              src="https://res.cloudinary.com/defdv9zw7/image/upload/v1771535143/BIRDHAUS_PNG_smaller_vlsqhf.png"
              alt="The Birdhaus logo"
              className="w-32 h-32 md:w-40 md:h-40"
            />
            <h1 className="text-4xl md:text-6xl font-bold text-center">The Birdhaus</h1>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-sm">
            <a href="#upcoming-shows" className="hover:underline">Upcoming Shows</a>
            <span className="hidden md:inline">•</span>
            <a href="/archive" className="hover:underline text-center">Archive (recordings of past shows)</a>
          </div>
        </div>

      {/* Hero Image */}
        <div className="w-full max-w-6xl mx-auto px-8 mb-12">
          <img 
            src="https://res.cloudinary.com/defdv9zw7/image/upload/v1771535212/IMG_7246_vdubka.jpg"
            alt="The Birdhaus venue"
            className="w-full h-auto rounded-lg mb-2"
          />
          <p className="text-sm text-gray-600 text-center">Mary Jam on 1/23/26 - Photo by Sabrina Rose</p>
        </div>

      {/* About */}
        <div className="max-w-4xl mx-auto px-8 mb-16">
          <p className="text-lg md:text-xl text-gray-600 text-center">
            the BIRDHAUS is an intimate house show venue located in Powderhorn, Minneapolis
          </p>
        </div>

      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-gray-600 text-lg">Click a specific show to RSVP + get all the details</p>
        </div>        
        {upcomingShows.length === 0 ? (
          <p className="text-gray-600">No upcoming shows scheduled.</p>
        ) : (
          <div className="space-y-6">
            {upcomingShows.map((show) => (
              <Link 
                key={show.slug} 
                href={`/shows/${show.slug}`}
                  className="block border border-gray-300 rounded p-6 hover:border-gray-600 transition-colors"
              >
                <p className="text-gray-600 mb-1">{show.date}</p>
                <h3 className="text-2xl font-bold mb-2">{show.title}</h3>
                <p className="text-gray-600">
                  {Array.isArray(show.bands) && show.bands.map((band) => 
                    typeof band === 'string' ? band : band.name
                  ).join(', ')}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12">
          <a href="/archive" className="block text-2xl hover:text-gray-600">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}