import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function ArchivePage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastShows = shows.filter((show) => new Date(show.date) < today);
  pastShows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const showCount = pastShows.length;
  const uniqueBands = new Set(
    pastShows.flatMap((show) =>
      show.bands.map((band) => (typeof band === 'string' ? band : band.name))
    )
  );
  const bandCount = uniqueBands.size;

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-gray-400 hover:text-white mb-8 inline-block">
          ← Back to home
        </a>

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
    </div>
  </div>
</div>

        {pastShows.length === 0 ? (
          <p className="text-gray-400">No past shows yet.</p>
        ) : (
          <div className="space-y-4">
            {pastShows.map((show) => (
              <Link
                key={show.slug}
                href={`/shows/${show.slug}`}
                className="flex gap-6 border border-gray-800 rounded-lg p-4 hover:border-gray-500 hover:bg-gray-900 transition-colors"
              >
                {/* Flyer thumbnail */}
                <div className="w-24 h-24 flex-shrink-0 rounded overflow-hidden bg-gray-900">
                  {show.flyer ? (
                    <img
                      src={show.flyer}
                      alt={`${show.title} flyer`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs text-center px-2">
                      No flyer
                    </div>
                  )}
                </div>

                {/* Show info */}
                <div className="flex flex-col justify-center min-w-0">
                  <p className="text-gray-500 text-sm mb-1">{show.date}</p>
                  <h2 className="text-xl font-bold mb-1 truncate">{show.title}</h2>
                  <p className="text-gray-400 text-sm truncate">
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