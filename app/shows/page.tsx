import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';
import Link from 'next/link';

export default async function ShowsPage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  
// Sort by date, soonest first
  shows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-8">Shows</h1>

        <div className="space-y-6">
          {shows.map((show) => (
            <Link
              key={show.slug}
              href={`/shows/${show.slug}`}
              className="block border border-[#E8E0D0]/20 rounded p-6 hover:border-[#E8E0D0]/50 transition-colors"
            >
              <p className="text-[#E8E0D0]/60 mb-1">{show.date}</p>
              <h2 className="text-2xl font-bold mb-2">{show.title}</h2>
              <p className="text-[#E8E0D0]/60">{show.bands.join(', ')}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}