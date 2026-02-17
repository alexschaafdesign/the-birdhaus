import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function ShowsPage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  
  // Sort by date, newest first
// Sort by date, soonest first
  shows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-gray-400 hover:text-white mb-8 inline-block">
          ← Back to home
        </a>

        <h1 className="text-5xl font-bold mb-8">Shows</h1>

        <div className="space-y-6">
          {shows.map((show) => (
            <Link 
              key={show.slug} 
              href={`/shows/${show.slug}`}
              className="block border border-gray-800 rounded p-6 hover:border-gray-500 transition-colors"
            >
              <p className="text-gray-400 mb-1">{show.date}</p>
              <h2 className="text-2xl font-bold mb-2">{show.title}</h2>
              <p className="text-gray-400">{show.bands.join(', ')}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}