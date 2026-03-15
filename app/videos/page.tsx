import { getAllShowSlugs, getShowBySlug } from '@/lib/shows';

export default async function VideosPage() {
  const slugs = getAllShowSlugs();
  const shows = await Promise.all(slugs.map((slug) => getShowBySlug(slug)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const allVideos = shows
    .filter((show) => new Date(show.date) < today)  // 👈 add this
    .filter((show) => show.videos && show.videos.length > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .flatMap((show) =>
        (show.videos ?? []).map((video) => ({
            ...video,
            showTitle: show.title,
            showSlug: show.slug,
            showDate: show.date,
        }))
        );

  const videoCount = allVideos.length;

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-gray-400 hover:text-white mb-8 inline-block">
          ← Back to home
        </a>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-5xl font-bold">Video</h1>
          <div className="font-mono text-sm border border-yellow-500/40 rounded-lg p-4 bg-yellow-500/5">
            <div>
              <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Videos</span>
              <span className="text-yellow-400 text-2xl">{String(videoCount).padStart(3, '0')}</span>
            </div>
          </div>
        </div>

        {allVideos.length === 0 ? (
          <p className="text-gray-400">No videos yet.</p>
        ) : (
          <div className="space-y-12">
            {allVideos.map((video, index) => (
              <div key={index} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="aspect-video">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${video.youtube}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="p-4">
                  <h2 className="text-xl font-bold mb-1">{video.title}</h2>
                  <p className="text-gray-500 text-sm font-mono">
                    {video.showDate} ·{' '}
                    
                      <a href={`/shows/${video.showSlug}`}
                      className="hover:text-gray-300 transition-colors"
                    >
                      {video.showTitle}
                    </a>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}