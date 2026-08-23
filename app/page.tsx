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

  const nextShow = upcomingShows[0] ?? null;
  let nextShowDate: { day: number; weekday: string; month: string } | null = null;
  if (nextShow) {
    const [year, month, day] = nextShow.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    nextShowDate = {
      day: date.getDate(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    };
  }

  return (
    <main className="min-h-screen">
      {/* About */}
      <div className="max-w-4xl mx-auto px-8 mb-8">
        <p className="text-base md:text-lg text-ink/70 text-center">
          the BIRDHAUS is a DIY house venue and record label located in Powderhorn, Minneapolis
        </p>
      </div>

      {/* Birdhaus Leaderboard */}
      {sortedBands.length > 0 && (
        <div className="max-w-4xl mx-auto px-8 mb-12">
          <details className="group border-2 border-ink bg-paper-deep shadow-hard">
            <summary className="px-5 py-4 cursor-pointer select-none list-none flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-mono font-bold text-base tracking-wide">BIRDHAUS ALUMS</span>
                <span className="text-ink/50 text-sm">{sortedBands.length} bands · {setCount} sets</span>
              </div>
              <span className="font-mono text-xs uppercase tracking-widest text-vhs-red group-open:hidden">Show ▸</span>
              <span className="font-mono text-xs uppercase tracking-widest text-vhs-red hidden group-open:inline">Hide ▾</span>
            </summary>
            <div className="px-5 pb-5 pt-3 border-t-2 border-ink columns-2 sm:columns-3 gap-x-6">
              {sortedBands.map(([name, { count, bandId }], i) => {
                const slug = bandId ? bandSlugs.get(bandId) : undefined;
                return (
                  <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-ink/15 break-inside-avoid">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className={`font-mono text-xs flex-shrink-0 w-6 text-right ${i < 3 ? 'text-vhs-red' : 'text-ink/40'}`}>
                        {i + 1}
                      </span>
                      {slug ? (
                        <Link href={`/bands/${slug}`} className={`text-sm truncate hover:underline ${i < 3 ? 'font-semibold' : 'text-ink/80'}`}>
                          {name}
                        </Link>
                      ) : (
                        <span className={`text-sm truncate ${i < 3 ? 'font-semibold' : 'text-ink/80'}`}>{name}</span>
                      )}
                    </span>
                    {count > 1 && (
                      <span className="text-xs text-vhs-blue font-mono flex-shrink-0">×{count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}

      {/* Next show + hero photo, side by side. The photo column sets the row
          height; the next-show flyer crops via object-cover to match it. */}
      <div className="w-full max-w-6xl mx-auto px-8 mb-12 grid gap-6 md:grid-cols-2 md:items-stretch">
        {nextShow && (
          <Link
            href={`/shows/${nextShow.slug}`}
            className="group flex flex-col border-2 border-ink bg-paper shadow-hard md:h-full"
          >
            <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink px-4 py-2.5">
              <span className="font-mono text-xs uppercase tracking-widest text-vhs-red">Next show</span>
              <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
                {nextShowDate!.weekday} {nextShowDate!.day} {nextShowDate!.month}
              </span>
            </div>
            <div className="relative aspect-[4/5] md:aspect-auto md:flex-1 bg-ink/10">
              {nextShow.flyer ? (
                <Image
                  src={nextShow.flyer}
                  alt={`${nextShow.title} flyer`}
                  fill
                  sizes="(max-width: 768px) 100vw, 544px"
                  priority
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-ink/40">
                  {nextShow.title}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t-2 border-ink px-4 py-2.5">
              <p className="min-w-0 truncate text-sm text-ink/70">
                {nextShow.bands.map((band) => (typeof band === 'string' ? band : band.name)).join(' · ')}
              </p>
              <span className="flex-shrink-0 font-mono text-xs uppercase tracking-wider text-vhs-red group-hover:underline">
                RSVP →
              </span>
            </div>
          </Link>
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