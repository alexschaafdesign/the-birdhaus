import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getPhotographerProfileBySlug, getPhotographerGalleries } from '@/lib/photographers';
import { broadcastDate } from '@/lib/catalogue';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import { imageSource } from '@/lib/image-source';
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

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const photographer = await getPhotographerProfileBySlug(slug);
  if (!photographer) return {};
  return {
    // The root layout's template adds "· the BIRDHAUS".
    title: `${photographer.name} · Photographer`,
    description: photographer.bio ?? `Photos by ${photographer.name} from The Birdhaus shows.`,
  };
}

// A photographer's public page (2027 frame): who they are, then every night
// they shot, newest first, each with its photos in a lightbox. Only for
// photographers with at least one photo on a show: a registry entry with none
// is a 404, the same as an unknown slug. ARCHIVE is the lit nav item.
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
  if (totalPhotos === 0) notFound();

  return (
    <SiteFrame stats={null} navPath="/photos">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        {photographer.photo && (
          <Image
            {...imageSource(photographer.photo, 192)}
            alt=""
            width={96}
            height={96}
            className="border-surface-ink size-24 shrink-0 rounded-full border object-cover"
          />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
            Photographer
          </p>
          <h1 className="text-header-1 leading-none font-bold break-words uppercase">{photographer.name}</h1>
          <p className="text-data-spec-12 uppercase">
            {totalPhotos} photo{totalPhotos === 1 ? '' : 's'} · {galleries.length} night
            {galleries.length === 1 ? '' : 's'}
          </p>
          {photographer.instagram && (
            <p className="text-body-3">
              <a
                href={instagramUrl(photographer.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                className={FORM.link}
              >
                {instagramHandle(photographer.instagram)} on Instagram ↗
              </a>
            </p>
          )}
        </div>
      </section>

      {photographer.bio && (
        <p className="text-body-3 max-w-2xl leading-normal whitespace-pre-line">{photographer.bio}</p>
      )}

      {galleries.map((gallery) => (
        <section key={gallery.showSlug} aria-label={gallery.showTitle} className="flex flex-col gap-4">
          <SectionHeader as="h2" label={broadcastDate(gallery.date)} count={gallery.photos.length} />
          <p className="text-ui-nav-item-14 flex flex-wrap items-baseline gap-x-3 leading-[1.3] tracking-[--spacing(0.25)] uppercase">
            <a href={`/shows/${gallery.showCatalogueId}`} className={FORM.link}>
              <span className="text-data-caption-13-bold text-accent-red font-bold">{gallery.showCatalogueId}</span>
            </a>
            <span className="min-w-0">{gallery.showTitle}</span>
          </p>
          <PhotoGallery photos={gallery.photos.map((url) => ({ url }))} showTitle={gallery.showTitle} />
        </section>
      ))}
    </SiteFrame>
  );
}
