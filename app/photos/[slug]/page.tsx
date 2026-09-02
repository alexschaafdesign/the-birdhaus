import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getPhotographerProfileBySlug, getPhotographerGalleries } from '@/lib/photographers';
import PhotoGallery from '@/components/PhotoGallery';

// Rendered on demand so a photographer's page always reflects the latest shows
// they've been credited on, without a rebuild.
export const dynamic = 'force-dynamic';

// Turn a stored instagram value (full URL, handle, or @handle) into a link + a
// display handle. The registry stores whatever was typed, so normalize both.
function instagramUrl(ig: string): string {
  const v = ig.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, '')}`;
}
function instagramHandle(ig: string): string {
  const v = ig.trim();
  const match = v.match(/instagram\.com\/([^/?#]+)/i);
  const handle = match ? match[1] : v.replace(/^@/, '');
  return `@${handle}`;
}

// Local (not UTC) formatting so a YYYY-MM-DD date never shifts a day.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const photographer = await getPhotographerProfileBySlug(slug);
  if (!photographer) return {};
  return {
    title: `${photographer.name} · Photographer · The Birdhaus`,
    description: photographer.bio ?? `Photos by ${photographer.name} from The Birdhaus shows.`,
  };
}

export default async function PhotographerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const photographer = await getPhotographerProfileBySlug(slug);
  if (!photographer) notFound();

  const galleries = await getPhotographerGalleries(photographer.id, photographer.name);
  const totalPhotos = galleries.reduce((n, g) => n + g.photos.length, 0);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/shows" className="text-sm text-[#E8E0D0]/50 hover:text-[#E8E0D0]">
          ← Shows
        </Link>

        <header className="mt-6 mb-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          {photographer.photo && (
            <Image
              src={photographer.photo}
              alt=""
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/50">Photographer</p>
            <h1 className="text-4xl font-bold">{photographer.name}</h1>
            {photographer.instagram && (
              <a
                href={instagramUrl(photographer.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D0]/30 px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10"
              >
                {instagramHandle(photographer.instagram)} on Instagram ↗
              </a>
            )}
          </div>
        </header>

        {photographer.bio && (
          <p className="mb-10 max-w-prose whitespace-pre-line text-[#E8E0D0]/80">{photographer.bio}</p>
        )}

        {galleries.length === 0 ? (
          <p className="text-[#E8E0D0]/50">No photos yet — check back after the next show.</p>
        ) : (
          <>
            <p className="mb-8 text-sm text-[#E8E0D0]/50">
              {totalPhotos} photo{totalPhotos === 1 ? '' : 's'} across {galleries.length} show
              {galleries.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-12">
              {galleries.map((gallery) => (
                <section key={gallery.showSlug}>
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <Link
                      href={`/shows/${gallery.showSlug}`}
                      className="text-2xl font-bold hover:underline"
                    >
                      {gallery.showTitle}
                    </Link>
                    <span className="whitespace-nowrap text-sm text-[#E8E0D0]/50">
                      {formatDate(gallery.date)}
                    </span>
                  </div>
                  <PhotoGallery
                    photos={gallery.photos.map((url) => ({ url }))}
                    showTitle={gallery.showTitle}
                  />
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
