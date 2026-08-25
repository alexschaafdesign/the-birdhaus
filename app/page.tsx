import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import Link from 'next/link';
import Image from 'next/image';
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

  // The calendar view doubles as a navigable archive, so it includes past shows
  // (regardless of announced status, since they already happened) alongside
  // announced upcoming ones.
  const calendarShows = [...pastShows, ...upcomingShows].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

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
          the BIRDHAUS is a DIY music empire based in Powderhorn, Minneapolis
        </p>
      </div>

      {/* Birdhaus Leaderboard */}
      {sortedBands.length > 0 && (
        <div className="max-w-4xl mx-auto px-8 mb-12">
          <details className="rounded-xl group bg-gradient-to-b from-yellow-500/10 to-[#E8E0D0]/5 border border-yellow-500/30 shadow-lg shadow-yellow-500/5">
            <summary className="px-5 py-4 cursor-pointer select-none list-none flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-bold text-base tracking-wide text-yellow-100">BIRDHAUS ALUMS</span>
                <span className="text-[#E8E0D0]/50 text-sm">{sortedBands.length} bands · {setCount} sets and counting...</span>
              </div>
              <span className="text-xs uppercase tracking-widest text-yellow-500/70 group-open:hidden">Show ▸</span>
              <span className="text-xs uppercase tracking-widest text-yellow-500/70 hidden group-open:inline">Hide ▾</span>
            </summary>
            <div className="px-5 pb-5 pt-3 border-t border-yellow-500/20 columns-2 sm:columns-3 gap-x-6">
              {sortedBands.map(([name, { count, bandId }], i) => {
                const slug = bandId ? bandSlugs.get(bandId) : undefined;
                return (
                  <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-[#E8E0D0]/10 break-inside-avoid">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className={`font-mono text-xs flex-shrink-0 w-6 text-right ${i < 3 ? 'text-yellow-500/80' : 'text-[#E8E0D0]/40'}`}>
                        {i + 1}
                      </span>
                      {slug ? (
                        <Link href={`/bands/${slug}`} className={`text-sm truncate hover:text-[#E8E0D0] hover:underline ${i < 3 ? 'text-yellow-100 font-semibold' : 'text-[#E8E0D0]/90'}`}>
                          {name}
                        </Link>
                      ) : (
                        <span className={`text-sm truncate ${i < 3 ? 'text-yellow-100 font-semibold' : 'text-[#E8E0D0]/90'}`}>{name}</span>
                      )}
                    </span>
                    {count > 1 && (
                      <span className="text-xs text-yellow-500/70 font-mono flex-shrink-0">×{count}</span>
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
        <Image
          src="https://images.thebirdhaus.org/misc/2016-01-16%20by%20Jeremy%20Nelson%205.jpg"
          alt="The Birdhaus venue"
          width={0}
          height={0}
          sizes="(max-width: 1152px) 100vw, 1088px"
          priority
          unoptimized
          className="w-full h-auto rounded-lg mb-2"
        />
        <p className="text-xs text-[#E8E0D0]/40 text-right">Photo by Jeremy Nelson</p>
      </div>

      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Upcoming Shows</h2>
          <p className="text-[#E8E0D0]/70 text-lg">Click a show to RSVP and get details</p>
        </div>
        <ShowsBrowser upcomingShows={upcomingShows} calendarShows={calendarShows} today={today} />

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-[#E8E0D0]/70">
            Archive →
          </a>
        </div>

        <div className="mt-16 text-center">
          <Link href="/admin/login" className="text-xs uppercase tracking-widest text-[#E8E0D0]/40 hover:text-[#E8E0D0]/70">
            Admin Login
          </Link>
        </div>
      </div>
    </main>
  );
}