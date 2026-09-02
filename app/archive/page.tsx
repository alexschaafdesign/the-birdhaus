import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getAllBandSlugs } from '@/lib/bands';
import Link from 'next/link';
import VideoArchive, { type ArchiveShowGroup } from '@/components/VideoArchive';

// Evaluate the upcoming/past split per request so it reflects the current date,
// not the date the site was last built/deployed.
export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const shows = await getAllShows();
  const bandSlugs = await getAllBandSlugs();

  const today = getTodayCentral();
  const pastShows = shows.filter((show) => show.date < today);
  pastShows.sort((a, b) => b.date.localeCompare(a.date));

  const showCount = pastShows.length;

  const bandNames = (show: (typeof pastShows)[number]) =>
    (Array.isArray(show.bands) ? show.bands : [])
      .map((band) => (typeof band === 'string' ? band : band.name))
      .filter(Boolean);

  // Every past show stays in the timeline in date order (newest first); shows
  // with videos lead with their sets, shows without render as a lighter row.
  const timeline: ArchiveShowGroup[] = pastShows.map((show) => ({
    slug: show.slug,
    title: show.title,
    date: show.date,
    bands: bandNames(show),
    flyer: show.flyer,
    videos: (show.videos ?? []).map((v) => ({ youtube: v.youtube, title: v.title })),
    photos: (show.photos ?? []).map((p) => p.url),
  }));

  const videoCount = timeline.reduce((sum, g) => sum + g.videos.length, 0);

  // Build band frequency map
  const bandCounts = new Map<string, { count: number; bandId: number | null }>();
  for (const show of pastShows) {
    for (const band of show.bands) {
      const name = typeof band === 'string' ? band : band.name;
      const bandId = typeof band === 'string' ? null : band.bandId ?? null;
      const existing = bandCounts.get(name);
      bandCounts.set(name, {
        count: (existing?.count ?? 0) + 1,
        bandId: existing?.bandId ?? bandId,
      });
    }
  }
  const bandCount = bandCounts.size;

  // Sort: most appearances first, then alphabetical
  const sortedBands = Array.from(bandCounts.entries()).sort((a, b) =>
    b[1].count - a[1].count || a[0].localeCompare(b[0])
  );

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <h1 className="text-5xl font-bold">ARCHIVE</h1>
          <div className="font-mono text-sm border border-yellow-500/40 rounded-lg p-4 bg-yellow-500/5">
            <div className="flex gap-4 sm:gap-8">
              <div>
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Shows</span>
                <span className="text-yellow-400 text-2xl">{String(showCount).padStart(3, '0')}</span>
              </div>
              <div className="border-l border-yellow-500/20 pl-4 sm:pl-8">
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Bands</span>
                <span className="text-yellow-400 text-2xl">{String(bandCount).padStart(3, '0')}</span>
              </div>
              <div className="border-l border-yellow-500/20 pl-4 sm:pl-8">
                <span className="text-yellow-500/60 uppercase tracking-widest text-xs block mb-1">Videos</span>
                <span className="text-yellow-400 text-2xl">{String(videoCount).padStart(3, '0')}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[#E8E0D0]/70 mb-10 max-w-2xl leading-relaxed">
          We pride ourselves on recording every band&apos;s full set, check em all out below!
        </p>

        {/* Band roster */}
        <details className="mb-12 border border-[#E8E0D0]/20 rounded-lg group">
          <summary className="px-4 py-3 cursor-pointer text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0] uppercase tracking-widest select-none list-none flex justify-between items-center">
            <span>Birdhaus alums - click to expand</span>
            <span className="text-xs text-[#E8E0D0]/40 group-open:hidden">▸ expand</span>
            <span className="text-xs text-[#E8E0D0]/40 hidden group-open:inline">▾ collapse</span>
          </summary>
          <div className="px-4 pb-4 pt-2 columns-2 sm:columns-3 gap-x-6">
            {sortedBands.map(([name, { count, bandId }]) => {
              const slug = bandId ? bandSlugs.get(bandId) : undefined;
              return (
                <div key={name} className="flex justify-between items-baseline gap-2 py-1 border-b border-[#E8E0D0]/10 break-inside-avoid">
                  {slug ? (
                    <Link href={`/bands/${slug}`} className="text-sm text-[#E8E0D0]/90 truncate hover:text-[#E8E0D0] hover:underline">
                      {name}
                    </Link>
                  ) : (
                    <span className="text-sm text-[#E8E0D0]/90 truncate">{name}</span>
                  )}
                  {count > 1 && (
                    <span className="text-xs text-yellow-500/70 font-mono flex-shrink-0">×{count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>

        {pastShows.length === 0 ? (
          <p className="text-[#E8E0D0]/60">No past shows yet.</p>
        ) : (
          <VideoArchive groups={timeline} />
        )}
      </div>
    </main>
  );
}
