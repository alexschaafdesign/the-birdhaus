import { getAllShows } from '@/lib/shows';
import Link from 'next/link';

export default async function ShowsPage() {
  const shows = await getAllShows();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
        <h1 className="text-5xl font-bold mb-8 uppercase tracking-tight">Shows</h1>

        <div className="space-y-6">
          {shows.map((show) => (
            <Link
              key={show.slug}
              href={`/shows/${show.slug}`}
              className="block border-2 border-ink bg-paper p-6 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard"
            >
              <p className="font-mono text-sm text-ink/60 mb-1">{show.date}</p>
              <h2 className="text-2xl font-bold mb-2">{show.title}</h2>
              <p className="text-ink/60">{show.bands.join(', ')}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}