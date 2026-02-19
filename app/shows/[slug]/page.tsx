import { getShowBySlug, getAllShowSlugs } from '@/lib/shows';
import RSVPForm from '@/components/RSVPForm';

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
        
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Lineup</h2>
          <ul className="space-y-1">
            {show.bands.map((band) => (
              <li key={band} className="text-lg">{band}</li>
            ))}
          </ul>
        </div>

        {show.description && (
          <p className="text-lg text-gray-300 mb-8">{show.description}</p>
        )}

        <RSVPForm showTitle={show.title} />

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