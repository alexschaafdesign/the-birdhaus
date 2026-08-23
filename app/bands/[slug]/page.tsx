import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getAllBands, getBandBySlug, getShowsForBand, getVideosForBand } from '@/lib/bands';
import AdminEditFAB from '@/components/admin/AdminEditFAB';
import { isAdminSession } from '@/lib/admin-session';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  const bands = await getAllBands();
  return bands.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) return {};

  const origin = band.isTouring ? (band.hometown ? `Touring · ${band.hometown}` : 'Touring') : 'Local';
  const description = band.bio?.trim() || `${band.name} — ${origin}. Has played the BIRDHAUS.`;
  const images = band.photo ? [{ url: band.photo, alt: band.name }] : undefined;

  return {
    title: band.name,
    description,
    openGraph: {
      type: 'profile',
      title: band.name,
      description,
      url: `/bands/${band.slug}`,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: band.name,
      description,
      images: band.photo ? [band.photo] : undefined,
    },
  };
}

export default async function BandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) notFound();

  const shows = await getShowsForBand(band.id);
  const videos = await getVideosForBand(band.id);
  const isAdmin = await isAdminSession();

  return (
    <main className="min-h-screen">
      {isAdmin && <AdminEditFAB href={`/admin/bands/${band.id}`} label="Edit Band" />}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="text-ink/70 hover:text-vhs-red mb-8 inline-block font-mono text-sm uppercase tracking-wide"
        >
          ← Back to home
        </Link>

        {band.photo && (
          <div className="relative w-full max-w-md aspect-square border-2 border-ink shadow-hard mb-6 overflow-hidden">
            <Image
              src={band.photo}
              alt={band.name}
              fill
              sizes="(max-width: 768px) 100vw, 448px"
              priority
              unoptimized
              className="object-cover"
            />
          </div>
        )}

        <div className="mb-6">
          <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
          <h1 className="text-4xl font-bold leading-tight uppercase tracking-tight">{band.name}</h1>
          <p className="font-mono text-ink/50 text-sm mt-1">
            {band.isTouring ? (band.hometown ? `Touring · ${band.hometown}` : 'Touring') : 'Local'}
          </p>
          {band.instagram && (
            <a
              href={band.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink/60 hover:text-vhs-red underline text-sm"
            >
              Instagram ↗
            </a>
          )}
          {band.twinsceneSlug && (
            <a
              href={`https://www.twinscene.org/bands/${band.twinsceneSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink/60 hover:text-vhs-red underline text-sm ml-3"
            >
              Twin Scene ↗
            </a>
          )}
        </div>

        {band.bio && (
          <p className="text-lg text-ink/80 mb-10 max-w-2xl leading-relaxed whitespace-pre-line">
            {band.bio}
          </p>
        )}

        <div className="border-t border-ink/15 pt-8">
          <h2 className="text-2xl font-bold mb-4 uppercase tracking-tight">Played at the Birdhaus</h2>
          {shows.length === 0 ? (
            <p className="text-ink/50">Hasn&rsquo;t played a Birdhaus show yet.</p>
          ) : (
            <div className="space-y-3">
              {shows.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  className="block border-2 border-ink bg-paper p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard"
                >
                  <p className="font-mono text-ink/50 text-sm mb-0.5">{show.date}</p>
                  <p className="font-semibold">{show.title}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {videos.length > 0 && (
          <div className="border-t border-ink/15 pt-8 mt-8">
            <h2 className="text-2xl font-bold mb-4 uppercase tracking-tight">Videos</h2>
            <div className="space-y-8">
              {videos.map((video, index) => (
                <div key={index}>
                  <Link
                    href={`/shows/${video.showSlug}`}
                    className="text-sm text-ink/50 hover:text-vhs-red mb-2 inline-block"
                  >
                    {video.showTitle}
                  </Link>
                  <div className="aspect-video overflow-hidden border-2 border-ink">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${video.youtube}`}
                      title={video.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
