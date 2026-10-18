import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getAllBands, getBandBySlug, getShowsForBand, getVideosForBand } from '@/lib/bands';
import AdminEditFAB from '@/components/admin/AdminEditFAB';
import { isAdminSession } from '@/lib/admin-session';
import { isPrivateBooking } from '@/lib/nights';
import { broadcastDate } from '@/lib/catalogue';
import { SiteFrame, NightBand } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShowRow } from '@/components/ui/ShowRow';
import { RecordingCard } from '@/components/ui/RecordingCard';
import { FORM } from '@/components/night/form';
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

// One band (2027 frame): photo, name, where they're from, links, bio, every
// night they played (archive rows), and their recorded sets as cards on an
// ink band, each opening the night's page. ARCHIVE is the lit nav item.
export default async function BandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) notFound();

  const isAdmin = await isAdminSession();
  // Unannounced upcoming shows are private bookings (their /shows/ page 404s
  // for the public), so they stay off the public band page too.
  const shows = (await getShowsForBand(band.id)).filter((s) => isAdmin || !isPrivateBooking(s));
  const videos = await getVideosForBand(band.id);
  const origin = band.isTouring ? (band.hometown ? `Touring · ${band.hometown}` : 'Touring') : 'Local';

  return (
    <SiteFrame stats={null} navPath="/bands">
      {isAdmin && <AdminEditFAB href={`/admin/bands/${band.id}`} label="Edit Band" />}

      <section className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
        {band.photo && (
          <div className="border-surface-ink relative aspect-square w-full max-w-xs shrink-0 overflow-hidden border">
            <Image
              src={band.photo}
              alt={band.name}
              fill
              sizes="(max-width: 640px) 100vw, 320px"
              priority
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        <div className="flex max-w-2xl min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
              Band
            </p>
            <h1 className="text-header-1 leading-none font-bold break-words uppercase">{band.name}</h1>
            <p className="text-data-spec-12 uppercase">{origin}</p>
          </div>
          {(band.instagram || band.twinsceneSlug) && (
            <p className="text-body-3 flex flex-wrap gap-x-5 gap-y-1">
              {band.instagram && (
                <a href={band.instagram} target="_blank" rel="noopener noreferrer" className={FORM.link}>
                  Instagram ↗
                </a>
              )}
              {band.twinsceneSlug && (
                <a
                  href={`https://www.twinscene.org/bands/${band.twinsceneSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={FORM.link}
                >
                  Twin Scene ↗
                </a>
              )}
            </p>
          )}
          {band.bio && <p className="text-body-3 leading-normal whitespace-pre-line">{band.bio}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader label="Played at the Birdhaus" count={shows.length || undefined} rule="none" />
        {shows.length === 0 ? (
          <p className="text-body-3 leading-normal">Hasn&rsquo;t played a Birdhaus show yet.</p>
        ) : (
          <div className="flex flex-col">
            {shows.map((show) => (
              <ShowRow
                key={show.id}
                href={`/shows/${show.catalogueId}`}
                catalogueId={show.catalogueId}
                date={broadcastDate(show.date)}
                lineup={show.title}
              />
            ))}
          </div>
        )}
      </section>

      {videos.length > 0 && (
        <NightBand label="Recordings">
          <SectionHeader label="Recordings" count={videos.length} ground="ink" rule="none" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {videos.map((video, index) => (
              <RecordingCard
                key={`${video.youtube}-${index}`}
                ground="ink"
                href={`/shows/${video.showCatalogueId}`}
                catalogueId={video.showCatalogueId}
                title={video.title || video.showTitle}
                thumbnail={`https://i.ytimg.com/vi/${video.youtube}/mqdefault.jpg`}
              />
            ))}
          </div>
        </NightBand>
      )}
    </SiteFrame>
  );
}
