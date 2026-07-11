import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import Link from 'next/link';
import ShowsBrowser from '@/components/ShowsBrowser';

// Evaluate the upcoming/past split per request so it reflects the current date,
// not the date the site was last built/deployed.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const shows = await getAllShows();
  const bandSlugs = await getAllBandSlugs();

  const today = getTodayCentral();

  const upcomingShows = shows.filter(
    (show) => show.date >= today && show.announced === true
  );
  upcomingShows.sort((a, b) => a.date.localeCompare(b.date));

  const pastShows = shows.filter((show) => show.date < today);

  const bandCounts = new Map<string, { count: number; bandId: number | null }>();
  for (const show of pastShows) {
    for (const band of show.bands) {
      const name = typeof band === 'string' ? band : band.name;
      const bandId = typeof band === 'string' ? null : band.bandId ?? null;
      const existing = bandCounts.get(name);
      bandCounts.set(name, {
        count: (existing?.count ?? 0) + 1,
        bandId: existing?.bandId ?? bandId,
      });
    }
  }
  const sortedBands = Array.from(bandCounts.entries()).sort((a, b) =>
    b[1].count - a[1].count || a[0].localeCompare(b[0])
  );
  const setCount = Array.from(bandCounts.values()).reduce((sum, b) => sum + b.count, 0);

  return (
    <main className="min-h-screen">
      {/* About */}
      <div className="max-w-4xl mx-auto px-8 mb-8">
        <p className="text-lg md:text-xl text-[#E8E0D0]/70 text-center">
          the BIRDHAUS is a DIY house venue and record label located in Powderhorn, Minneapolis
        </p>
      </div>

      {/* Band Roster */}
      {sortedBands.length > 0 && (
        <div className="max-w-4xl mx-auto px-8 mb-12">
          <details className="rounded-lg group bg-[#E8E0D0]/5">
            <summary className="px-5 py-4 cursor-pointer select-none list-none flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-bold">BIRDHAUS alums</span>
                <span className="text-[#E8E0D0]/50 text-sm">{sortedBands.length} bands ({setCount} total sets) and counting...</span>
              </div>
              <span className="text-xs uppercase tracking-widest text-[#E8E0D0]/50 group-open:hidden">Show ▸</span>
              <span className="text-xs uppercase tracking-widest text-[#E8E0D0]/50 hidden group-open:inline">Hide ▾</span>
            </summary>
            <div className="px-5 pb-5 pt-3 border-t border-[#E8E0D0]/15 columns-2 sm:columns-3 gap-x-6">
              {sortedBands.map(([name, { count, bandId }]) => {
                const slug = bandId ? bandSlugs.get(bandId) : undefined;
                return (
                  <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-[#E8E0D0]/15 break-inside-avoid">
                    {slug ? (
                      <Link href={`/bands/${slug}`} className="text-sm text-[#E8E0D0]/90 hover:text-[#E8E0D0] hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-sm text-[#E8E0D0]/90">{name}</span>
                    )}
                    {count > 1 && (
                      <span className="text-xs text-[#E8E0D0]/50 font-mono flex-shrink-0">×{count}</span>
                    )}
                  </div>
                );
              })}
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
        <p className="text-sm text-[#E8E0D0]/70 text-center">Mary Jam on 1/23/26 - Photo by Sabrina Rose</p>
      </div>

      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-[#E8E0D0]/70 text-lg">Click a show to RSVP and get details</p>
        </div>
        <ShowsBrowser shows={upcomingShows} />

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-[#E8E0D0]/70">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}