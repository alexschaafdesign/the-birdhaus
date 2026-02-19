import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function ArchivePage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  
  // Filter for past shows only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastShows = shows.filter((show) => new Date(show.date) < today);
  
  // Sort by date, newest first
  pastShows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-gray-400 hover:text-white mb-8 inline-block">
          ← Back to home
        </a>

        <h1 className="text-5xl font-bold mb-8">Archive</h1>

        {pastShows.length === 0 ? (
          <p className="text-gray-400">No past shows yet.</p>
        ) : (
          <div className="space-y-6">
            {pastShows.map((show) => (
              <Link 
                key={show.slug} 
                href={`/shows/${show.slug}`}
                className="block border border-gray-800 rounded p-6 hover:border-gray-500 transition-colors"
              >
                <p className="text-gray-400 mb-1">{show.date}</p>
                <h2 className="text-2xl font-bold mb-2">{show.title}</h2>
                <p className="text-gray-400">
                  {Array.isArray(show.bands) && show.bands.map((band) => 
                    typeof band === 'string' ? band : band.name
                  ).join(', ')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}