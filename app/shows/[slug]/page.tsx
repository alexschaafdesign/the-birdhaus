import { getShowBySlug, getAllShowSlugs } from '@/lib/shows';
import RSVPForm from '@/components/RSVPForm';
import PhotoGallery from '@/components/PhotoGallery';

export async function generateStaticParams() {
  const slugs = getAllShowSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function ShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await getShowBySlug(slug);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-gray-400 hover:text-white mb-8 inline-block">
          ← Back to home
        </a>

        <h1 className="text-5xl font-bold mb-2">{show.title}</h1>
        <p className="text-xl text-gray-400 mb-4">{show.date}</p>

        {show.flyer && (
          <img 
            src={show.flyer} 
            alt={`${show.title} flyer`}
            className="w-full max-w-2xl mx-auto rounded mb-8"
          />
        )}
        
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Lineup</h2>
          <ul className="space-y-1">
            {show.bands.map((band, index) => {
              const bandName = typeof band === 'string' ? band : band.name;
              const instagram = typeof band === 'string' ? null : band.instagram;
              
              return (
                <li key={index} className="text-lg">
                  {instagram ? (
                    <a 
                      href={instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-gray-400 underline"
                    >
                      {bandName}
                    </a>
                  ) : (
                    bandName
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {show.description && (
          <p className="text-lg text-gray-300 mb-8">{show.description}</p>
        )}

        {new Date(show.date) >= new Date() && (
          <RSVPForm showTitle={show.title} />   
          )}
        {show.videos && show.videos.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Videos</h2>
            <div className="space-y-8">
              {show.videos.map((video, index) => (
                <div key={index}>
                  <h3 className="text-xl mb-3">{video.title}</h3>
                  <div className="aspect-video">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${video.youtube}`}
                      title={video.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="rounded"
                    ></iframe>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {show.audio && show.audio.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Audio</h2>
            <div className="space-y-8">
              {show.audio.map((audio, index) => (
                <div key={index}>
                  <h3 className="text-xl mb-3">{audio.title}</h3>
                  <iframe
                    style={{ border: 0, width: '100%', height: '120px' }}
                    src={audio.bandcamp}
                    seamless
                  ></iframe>
                </div>
              ))}
            </div>
          </div>
        )}

        {show.photos && show.photos.length > 0 && (
  <div className="mb-12">
    <h2 className="text-3xl font-bold mb-2">Photos</h2>
    {show.photographer && (
      <p className="text-gray-400 mb-6">
        Photos by{' '}
        {typeof show.photographer === 'string' ? (
          show.photographer
        ) : show.photographer.instagram ? (
          <a 
            href={show.photographer.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white underline"
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

        {show.content && (
          <div 
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: show.content }}
          />
        )}
      </div>
    </main>
  );
}