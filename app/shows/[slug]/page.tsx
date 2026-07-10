import { getShowBySlug, getAllShowSlugs } from '@/lib/shows';
import { getPhotosFromFolder } from '@/lib/cloudinary';
import RSVPForm from '@/components/RSVPForm';
import PhotoGallery from '@/components/PhotoGallery';
import CloudinaryGallery from '@/components/CloudinaryGallery';

export async function generateStaticParams() {
  const slugs = getAllShowSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function ShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await getShowBySlug(slug);

  const galleryPhotos = show.photoFolder
    ? await getPhotosFromFolder(show.photoFolder)
    : [];

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const today = new Date(todayStr);
  const [year, month, day] = show.date.split('-').map(Number);
  const showDate = new Date(year, month - 1, day);
  const isPast = showDate < today;

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
          <h1 className="text-5xl md:text-6xl font-bold mb-3 leading-tight">{show.title}</h1>
          
          <div className="flex flex-wrap gap-3 text-base text-[#E8E0D0]/70">
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
          <p className="text-lg text-[#E8E0D0]/80 mb-10 max-w-3xl leading-relaxed whitespace-pre-line">
            {show.description}
          </p>
        )}

        {/* Flyer */}
        {show.flyer && (
          <div className="mb-10">
            <img 
              src={show.flyer} 
              alt={`${show.title} flyer`}
              className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
            />
          </div>
        )}

        {/* Lineup */}
        <div className="mb-10 bg-[#E8E0D0]/5 rounded-lg p-6 border border-[#E8E0D0]/20">
          <h2 className="text-2xl font-bold mb-4">Lineup</h2>
          <div className="space-y-4">
            {show.bands.map((band, index) => {
              const bandName = typeof band === 'string' ? band : band.name;
              const instagram = typeof band === 'string' ? null : band.instagram;
              const bio = typeof band === 'string' ? null : band.bio;

              return (
                <div key={index}>
                  <div className="text-lg font-medium">
                    {instagram ? (
                      <a
                        href={instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#E8E0D0]/70 underline decoration-2 underline-offset-2 transition-colors"
                      >
                        {bandName}
                      </a>
                    ) : (
                      bandName
                    )}
                  </div>
                  {bio && (
                    <p className="text-[#E8E0D0]/70 mt-1 max-w-3xl leading-relaxed whitespace-pre-line">
                      {bio}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RSVP Form */}
        {!isPast && show.rsvpForm && (
          <RSVPForm 
            showTitle={show.title}
            showDate={show.date}
            doorsTime={show.doorsTime}
            showTime={show.showTime}
            flyerUrl={show.flyer}
            ticketUrl={show.ticketUrl}
          />
        )}

        {/* External ticket link (e.g. promoter's ticket page) */}
        {!isPast && show.externalTicketUrl && (
          <div className="border-2 border-[#E8E0D0]/20 rounded-lg p-8 mb-12 bg-[#E8E0D0]/5">
            <h2 className="text-3xl font-bold mb-2">Tickets</h2>
            <p className="text-[#E8E0D0]/70 mb-6">
              Tickets for this show are handled by an external promoter.
            </p>
            <a
              href={show.externalTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#E8E0D0] text-[#2A2420] font-bold py-4 px-6 rounded-lg hover:bg-[#E8E0D0]/80 transition-colors"
            >
              Get Tickets →
            </a>
          </div>
        )}

        {/* Videos */}
        {show.videos && show.videos.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Videos</h2>
            <div className="space-y-8">
              {show.videos.map((video, index) => (
                <div key={index}>
                  <h3 className="text-xl mb-3 font-medium">{video.title}</h3>
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
            <h2 className="text-3xl font-bold mb-6">Audio</h2>
            <div className="space-y-8">
              {show.audio.map((audio, index) => (
                <div key={index}>
                  <h3 className="text-xl mb-3 font-medium">{audio.title}</h3>
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
        {show.photos && show.photos.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-2">Photos</h2>
            {show.photographer && (
              <p className="text-[#E8E0D0]/70 mb-6">
                Photos by{' '}
                {typeof show.photographer === 'string' ? (
                  show.photographer
                ) : show.photographer.instagram ? (
                  <a
                    href={show.photographer.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#E8E0D0] underline"
                  >
                    {show.photographer.name}
                  </a>
                ) : (
                  show.photographer.name
                )}
              </p>
            )}
            <PhotoGallery photos={show.photos} showTitle={show.title} />
          </div>
        )}

        {/* Cloudinary gallery */}
        {show.photoFolder && galleryPhotos.length > 0 && (
          <div className="mb-12">
            <div className="flex flex-wrap items-baseline gap-x-3 mb-6">
              <h2 className="text-3xl font-bold">Gallery</h2>
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