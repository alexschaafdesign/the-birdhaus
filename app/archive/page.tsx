import { getAllShowSlugs, getShowBySlug, getTodayCentral } from '@/lib/shows';
import Link from 'next/link';

// Evaluate the upcoming/past split per request so it reflects the current date,
// not the date the site was last built/deployed.
export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));

  const today = getTodayCentral();
  const pastShows = shows.filter((show) => show.date < today);
  pastShows.sort((a, b) => b.date.localeCompare(a.date));

  const showCount = pastShows.length;

  // Build band frequency map
  const bandCounts = new Map<string, number>();
  for (const show of pastShows) {
    for (const band of show.bands) {
      const name = typeof band === 'string' ? band : band.name;
      bandCounts.set(name, (bandCounts.get(name) ?? 0) + 1);
    }
  }
  const bandCount = bandCounts.size;
  const setCount = Array.from(bandCounts.values()).reduce((sum, count) => sum + count, 0);

  // Sort: most appearances first, then alphabetical
  const sortedBands = Array.from(bandCounts.entries()).sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  );

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-5xl font-bold">ARCHIVE</h1>
          <div className="font-mono text-sm border border-yellow-500/40 rounded-lg p-4 bg-yellow-500/5">
            <div className="flex gap-8">
              <div>
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Shows</span>
                <span className="text-yellow-400 text-2xl">{String(showCount).padStart(3, '0')}</span>
              </div>
              <div className="border-l border-yellow-500/20 pl-8">
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Bands</span>
                <span className="text-yellow-400 text-2xl">{String(bandCount).padStart(3, '0')}</span>
              </div>
              <div className="border-l border-yellow-500/20 pl-8">
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Sets</span>
                <span className="text-yellow-400 text-2xl">{String(setCount).padStart(3, '0')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Band roster */}
        <details className="mb-10 border border-[#E8E0D0]/20 rounded-lg group">
          <summary className="px-4 py-3 cursor-pointer text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0] uppercase tracking-widest select-none list-none flex justify-between items-center">
            <span>Birdhaus alums - click to expand</span>
            <span className="text-xs text-[#E8E0D0]/40 group-open:hidden">▸ expand</span>
            <span className="text-xs text-[#E8E0D0]/40 hidden group-open:inline">▾ collapse</span>
          </summary>
          <div className="px-4 pb-4 pt-2 columns-2 sm:columns-3 gap-x-6">
            {sortedBands.map(([name, count]) => (
              <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-[#E8E0D0]/10 break-inside-avoid">
                <span className="text-sm text-[#E8E0D0]/90 truncate">{name}</span>
                {count > 1 && (
                  <span className="text-xs text-yellow-500/70 font-mono flex-shrink-0">×{count}</span>
                )}
              </div>
            ))}
          </div>
        </details>

        {pastShows.length === 0 ? (
          <p className="text-[#E8E0D0]/60">No past shows yet.</p>
        ) : (
          <div className="space-y-4">
            {pastShows.map((show) => (
              <Link
                key={show.slug}
                href={`/shows/${show.slug}`}
                className="flex gap-6 border border-[#E8E0D0]/20 rounded-lg p-4 hover:border-[#E8E0D0]/50 hover:bg-[#E8E0D0]/5 transition-colors"
              >
                <div className="w-24 h-24 flex-shrink-0 rounded overflow-hidden bg-[#E8E0D0]/10">
                  {show.flyer ? (
                    <img
                      src={show.flyer}
                      alt={`${show.title} flyer`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#E8E0D0]/40 text-xs text-center px-2">
                      No flyer
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <p className="text-[#E8E0D0]/50 text-sm mb-1">{show.date}</p>
                  <h2 className="text-xl font-bold mb-1 truncate">{show.title}</h2>
                  <p className="text-[#E8E0D0]/60 text-sm truncate">
                    {Array.isArray(show.bands) && show.bands.map((band) =>
                      typeof band === 'string' ? band : band.name
                    ).join(', ')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}