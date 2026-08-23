import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import Link from 'next/link';
import Image from 'next/image';
import ShowsBrowser from '@/components/ShowsBrowser';
import AlumsBox from '@/components/AlumsBox';

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
        <p className="text-base md:text-lg text-ink/70 text-center">
          the BIRDHAUS is a DIY house venue and record label located in Powderhorn, Minneapolis
        </p>
      </div>

      {/* Alums leaderboard + hero photo, side by side. The alums box (collapsed)
          sets the row height; the photo crops via object-cover to match it. */}
      <div className="w-full max-w-6xl mx-auto px-8 mb-12 grid gap-6 md:grid-cols-2 md:items-stretch">
        {sortedBands.length > 0 && (
          <AlumsBox
            bands={sortedBands.map(([name, { count, bandId }]) => ({
              name,
              count,
              slug: bandId ? bandSlugs.get(bandId) : undefined,
            }))}
            setCount={setCount}
          />
        )}
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] md:aspect-auto md:flex-1 border-2 border-ink">
            <Image
              src="https://images.thebirdhaus.org/misc/2016-01-16%20by%20Jeremy%20Nelson%205.jpg"
              alt="The Birdhaus venue"
              fill
              sizes="(max-width: 768px) 100vw, 544px"
              priority
              unoptimized
              className="object-cover"
            />
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-ink/50 text-right">Photo by Jeremy Nelson</p>
        </div>
      </div>

      {/* Upcoming Shows */}
      <div id="upcoming-shows" className="max-w-4xl mx-auto px-8 pb-16">
        <div className="mb-8">
          <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
          <h2 className="text-4xl font-bold mb-2 uppercase tracking-tight">Upcoming Shows</h2>
          <p className="text-ink/60 text-base">Click a show to RSVP and get details</p>
        </div>
        <ShowsBrowser upcomingShows={upcomingShows} calendarShows={calendarShows} today={today} />

        <div className="mt-8">
          <a href="/archive" className="block text-2xl hover:text-vhs-red">
            Archive →
          </a>
        </div>

        <div className="mt-16 text-center">
          <Link href="/admin/login" className="font-mono text-xs uppercase tracking-widest text-ink/40 hover:text-ink/70">
            Admin Login
          </Link>
        </div>
      </div>
    </main>
  );
}