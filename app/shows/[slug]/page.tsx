import { getShowBySlug, getAllShows, getTicketAvailability, slugify } from '@/lib/shows';
import { getPhotosFromFolder } from '@/lib/cloudinary';
import { getPhotographerCredits, getPhotographerProfileBySlug } from '@/lib/photographers';
import { getAllBands } from '@/lib/bands';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import RSVPForm from '@/components/RSVPForm';
import PhotoGallery from '@/components/PhotoGallery';
import CloudinaryGallery from '@/components/CloudinaryGallery';
import AdminEditFAB from '@/components/admin/AdminEditFAB';
import { isAdminSession } from '@/lib/admin-session';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  const shows = await getAllShows();
  return shows.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
  if (!show) return {};

  const prettyDate = new Date(show.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const lineup = show.bands
    .map((b) => (typeof b === 'string' ? b : b.name))
    .filter(Boolean)
    .join(', ');
  const description =
    show.description?.trim() ||
    [prettyDate, lineup && `Lineup: ${lineup}`].filter(Boolean).join(' — ') ||
    `A show at the BIRDHAUS on ${prettyDate}.`;

  const images = show.flyer ? [{ url: show.flyer, alt: `${show.title} flyer` }] : undefined;

  return {
    title: show.title,
    description,
    openGraph: {
      type: 'article',
      title: show.title,
      description,
      url: `/shows/${show.slug}`,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: show.title,
      description,
      images: show.flyer ? [show.flyer] : undefined,
    },
  };
}

export default async function ShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
  if (!show) notFound();

  const isAdmin = await isAdminSession();

  const galleryPhotos = show.photoFolder
    ? await getPhotosFromFolder(show.photoFolder)
    : [];

  // Resolve each uploaded photo's photographerId → name/instagram for per-photo
  // credit in the lightbox. Also derive a single gallery-wide credit when every
  // photo shares one photographer (the common case), falling back to the legacy
  // show-level `show.photographer` only when there are no per-photo credits.
  const showPhotos = show.photos ?? [];
  const photoCredits = await getPhotographerCredits(
    showPhotos.map((p) => p.photographerId).filter((n): n is number => n != null)
  );
  const photosWithCredit = showPhotos.map((p) => ({
    url: p.url,
    credit: p.photographerId != null ? photoCredits.get(p.photographerId) ?? null : null,
  }));
  const creditedIds = new Set(
    showPhotos.map((p) => p.photographerId).filter((n): n is number => n != null)
  );
  const uniformCredit =
    creditedIds.size === 1 && showPhotos.every((p) => p.photographerId != null)
      ? photoCredits.get([...creditedIds][0]) ?? null
      : null;
  // Legacy galleries (no per-photo ids) fall back to the show-level photographer
  // name. Link it to that photographer's profile page when they're in the
  // registry; otherwise render plain text (never the stored instagram value as
  // an href — it may be malformed and 404 relative to /shows/).
  const legacyName =
    creditedIds.size === 0
      ? typeof show.photographer === 'string'
        ? show.photographer
        : show.photographer?.name ?? null
      : null;
  const legacyProfile = legacyName
    ? await getPhotographerProfileBySlug(slugify(legacyName))
    : null;
  // Per-show band entries can override name/bio/photo/instagram, but almost
  // never do in practice — the band's own profile (curated centrally via
  // /admin/bands) is where this actually gets filled in. Fall back to that.
  const bandsById = new Map((await getAllBands()).map((b) => [b.id, b]));

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const today = new Date(todayStr);
  const [year, month, day] = show.date.split('-').map(Number);
  const showDate = new Date(year, month - 1, day);
  const isPast = showDate < today;

  // When a show hits its online ticket cap, the RSVP form is replaced by a
  // sold-out notice. Only relevant for upcoming, capped shows. The webhook
  // revalidates this page as sales land, so it flips on its own at the cap.
  const soldOut =
    !isPast && (await getTicketAvailability(show.id, show.ticketLimit ?? null)).soldOut;

  // Format date nicely
  const dateObj = new Date(show.date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <main className="min-h-screen">
      {isAdmin && <AdminEditFAB href={`/admin/shows/${show.id}`} label="Edit Show" />}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Back link */}
        <a
          href={isPast ? "/archive" : "/"}
          className="text-[#E8E0D0]/70 hover:text-[#E8E0D0] mb-8 inline-block text-sm uppercase tracking-wide"
        >
          ← {isPast ? "Back to archive" : "Back to home"}
        </a>

        {/* Header section */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3 leading-tight">{show.title}</h1>

          <div className="flex flex-wrap gap-3 text-sm text-[#E8E0D0]/70">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formattedDate}</span>
            </div>
            
            {show.doorsTime && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Doors: {show.doorsTime}</span>
              </div>
            )}
            
            {show.showTime && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span>Show: {show.showTime}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {show.description && (
          <p className="text-base text-[#E8E0D0]/80 mb-10 max-w-3xl leading-relaxed whitespace-pre-line">
            {show.description}
          </p>
        )}

        {/* Flyer + RSVP/tickets side by side */}
        {(show.flyer || (!isPast && (soldOut || show.rsvpForm || show.externalTicketUrl))) && (
          <div className="grid md:grid-cols-2 gap-8 mb-10 items-start">
            {show.flyer && (
              <Image
                src={show.flyer}
                alt={`${show.title} flyer`}
                width={0}
                height={0}
                sizes="(max-width: 768px) 100vw, 512px"
                priority
                unoptimized
                className="w-full max-w-lg mx-auto h-auto rounded-lg shadow-lg"
              />
            )}

            {/* Sold out: enough advance tickets sold that we're at capacity.
                Replaces the RSVP form once the ticket cap is reached. */}
            {!isPast && soldOut && (
              <div className="border-2 border-[#E8E0D0]/20 rounded-lg p-6 bg-[#E8E0D0]/5">
                <h2 className="text-xl font-bold mb-2">This show is sold out</h2>
                <p className="text-sm text-[#E8E0D0]/70">
                  Enough people have bought advance tickets (not just a free RSVP) that we&apos;re at
                  capacity. Thanks!
                </p>
              </div>
            )}

            {!isPast && !soldOut && show.rsvpForm && (
              <div className="aspect-square">
                <RSVPForm
                  showId={show.id}
                  ticketUrl={show.ticketUrl}
                />
              </div>
            )}

            {/* External ticket link (e.g. promoter's ticket page) */}
            {!isPast && !soldOut && !show.rsvpForm && show.externalTicketUrl && (
              <div className="border-2 border-[#E8E0D0]/20 rounded-lg p-6 bg-[#E8E0D0]/5">
                <h2 className="text-xl font-bold mb-2">Tickets</h2>
                <p className="text-sm text-[#E8E0D0]/70 mb-6">
                  Tickets for this show are handled by an external promoter.
                </p>
                <a
                  href={show.externalTicketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-[#E8E0D0] text-[#2A2420] font-bold py-3 px-6 rounded-lg hover:bg-[#E8E0D0]/80 transition-colors"
                >
                  Get Tickets →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Lineup */}
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-4">Lineup</h2>
          <div className="grid gap-4 grid-cols-1">
            {show.bands.map((band, index) => {
              const bandName = typeof band === 'string' ? band : band.name;
              const bandId = typeof band === 'string' ? null : band.bandId;
              const centralBand = bandId ? bandsById.get(bandId) : undefined;

              const instagram = (typeof band === 'string' ? null : band.instagram) || centralBand?.instagram || null;
              const bio = (typeof band === 'string' ? null : band.bio) || centralBand?.bio || null;
              const photo = (typeof band === 'string' ? null : band.photo) || centralBand?.photo || null;
              const bandSlug = centralBand?.slug;

              const cardBody = (
                <div className="flex gap-4 border border-[#E8E0D0]/20 rounded-lg p-4 h-full group-hover:border-[#E8E0D0]/50 transition-colors">
                  {photo ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <Image src={photo} alt={bandName} fill sizes="64px" unoptimized className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-[#E8E0D0]/5 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-[#E8E0D0]/20">
                        {bandName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base group-hover:text-[#E8E0D0]/70 transition-colors">
                      {bandName}
                    </p>
                    {bio && (
                      <p className="text-sm text-[#E8E0D0]/70 mt-1 leading-relaxed whitespace-pre-line line-clamp-4">
                        {bio}
                      </p>
                    )}
                    {!bandSlug && instagram && (
                      <a
                        href={instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0]/80 underline mt-2 inline-block"
                      >
                        Instagram ↗
                      </a>
                    )}
                  </div>
                </div>
              );

              return bandSlug ? (
                <Link key={index} href={`/bands/${bandSlug}`} className="group block">
                  {cardBody}
                </Link>
              ) : (
                <div key={index}>{cardBody}</div>
              );
            })}
          </div>
        </div>

        {/* Videos */}
        {show.videos && show.videos.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Videos</h2>
            <div className="space-y-8">
              {show.videos.map((video, index) => (
                <div key={index}>
                  <h3 className="text-base mb-3 font-medium">{video.title}</h3>
                  <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
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

        {/* Audio */}
        {show.audio && show.audio.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Audio</h2>
            <div className="space-y-8">
              {show.audio.map((audio, index) => (
                <div key={index}>
                  <h3 className="text-base mb-3 font-medium">{audio.title}</h3>
                  <iframe
                    style={{ border: 0, width: '100%', height: '120px' }}
                    src={audio.bandcamp}
                    seamless
                    className="rounded-lg"
                  ></iframe>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {photosWithCredit.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-2">Photos</h2>
            {uniformCredit ? (
              // Every photo is by the same photographer — one gallery-wide line
              // linking to their Birdhaus profile page (which carries their IG).
              <p className="text-sm text-[#E8E0D0]/70 mb-6">
                Photos by{' '}
                <Link
                  href={`/photos/${slugify(uniformCredit.name)}`}
                  className="hover:text-[#E8E0D0] underline"
                >
                  {uniformCredit.name}
                </Link>
              </p>
            ) : legacyName ? (
              // No per-photo credits (legacy show) — fall back to the show-level
              // photographer name, linked to their profile if they're in the
              // registry.
              <p className="text-sm text-[#E8E0D0]/70 mb-6">
                Photos by{' '}
                {legacyProfile ? (
                  <Link
                    href={`/photos/${slugify(legacyName)}`}
                    className="hover:text-[#E8E0D0] underline"
                  >
                    {legacyName}
                  </Link>
                ) : (
                  legacyName
                )}
              </p>
            ) : null}
            {/* Mixed credits (more than one photographer) show per-photo in the lightbox. */}
            <PhotoGallery photos={photosWithCredit} showTitle={show.title} />
          </div>
        )}

        {/* Cloudinary gallery */}
        {show.photoFolder && galleryPhotos.length > 0 && (
          <div className="mb-12">
            <div className="flex flex-wrap items-baseline gap-x-3 mb-6">
              <h2 className="text-2xl font-bold">Gallery</h2>
              {show.photoCredit && (
                <span className="text-sm text-[#E8E0D0]/50">Photos by {show.photoCredit}</span>
              )}
            </div>
            <CloudinaryGallery photos={galleryPhotos} showTitle={show.title} />
          </div>
        )}

        {/* Content */}
        {show.content && (
          <div 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: show.content }}
          />
        )}
      </div>
    </main>
  );
}