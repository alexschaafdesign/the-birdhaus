import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllBands, getBandBySlug, getShowsForBand } from '@/lib/bands';

export async function generateStaticParams() {
  const bands = await getAllBands();
  return bands.map(({ slug }) => ({ slug }));
}

export default async function BandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) notFound();

  const shows = await getShowsForBand(band.id);

  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="text-[#E8E0D0]/70 hover:text-[#E8E0D0] mb-8 inline-block text-sm uppercase tracking-wide"
        >
          ← Back to home
        </Link>

        <div className="flex items-center gap-5 mb-6">
          {band.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={band.photo}
              alt={band.name}
              className="w-24 h-24 rounded-full object-cover flex-shrink-0"
            />
          )}
          <div>
            <h1 className="text-4xl font-bold leading-tight">{band.name}</h1>
            {band.instagram && (
              <a
                href={band.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline text-sm"
              >
                Instagram ↗
              </a>
            )}
          </div>
        </div>

        {band.bio && (
          <p className="text-lg text-[#E8E0D0]/80 mb-10 max-w-2xl leading-relaxed whitespace-pre-line">
            {band.bio}
          </p>
        )}

        <div className="border-t border-[#E8E0D0]/15 pt-8">
          <h2 className="text-2xl font-bold mb-4">Played at the Birdhaus</h2>
          {shows.length === 0 ? (
            <p className="text-[#E8E0D0]/50">Hasn&rsquo;t played a Birdhaus show yet.</p>
          ) : (
            <div className="space-y-3">
              {shows.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  className="block border border-[#E8E0D0]/20 rounded p-4 hover:border-[#E8E0D0]/50 transition-colors"
                >
                  <p className="text-[#E8E0D0]/50 text-sm mb-0.5">{show.date}</p>
                  <p className="font-semibold">{show.title}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
