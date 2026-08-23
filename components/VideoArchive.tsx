'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

export type ArchiveVideo = { youtube: string; title: string };
export type ArchiveShowGroup = {
  slug: string;
  title: string;
  date: string;
  bands: string[];
  flyer?: string;
  videos: ArchiveVideo[];
};

function VideoCard({ video }: { video: ArchiveVideo }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="border-2 border-ink overflow-hidden bg-paper">
      <div className="aspect-video bg-black">
        {playing ? (
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${video.youtube}?autoplay=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${video.title}`}
            className="group relative block w-full h-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${video.youtube}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-opacity group-hover:opacity-80"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex items-center justify-center w-16 h-16 bg-ink/80 group-hover:bg-vhs-red transition-colors">
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white translate-x-0.5" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-3 border-t-2 border-ink">
        <h3 className="text-sm font-medium leading-snug">{video.title}</h3>
      </div>
    </div>
  );
}

function ShowHeader({ show }: { show: ArchiveShowGroup }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-vhs-red text-xs font-mono uppercase tracking-widest mb-1">
        {show.date}
      </p>
      <h2 className="text-2xl font-bold leading-tight">
        <Link href={`/shows/${show.slug}`} className="hover:text-vhs-red transition-colors">
          {show.title}
        </Link>
      </h2>
      {show.bands.length > 0 && (
        <p className="text-ink/60 text-sm">{show.bands.join(', ')}</p>
      )}
    </div>
  );
}

export default function VideoArchive({ groups }: { groups: ArchiveShowGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((show) => {
        const hasVideos = show.videos.length > 0;

        // Shows without videos still hold their place in the timeline, but render
        // as a lighter row (flyer + header) instead of a video grid.
        if (!hasVideos) {
          return (
            <section key={show.slug}>
              <Link
                href={`/shows/${show.slug}`}
                className="flex gap-5 items-center border-2 border-ink/30 p-4 hover:border-ink hover:bg-paper-deep transition-colors"
              >
                <div className="relative w-20 h-20 flex-shrink-0 border-2 border-ink overflow-hidden bg-ink/10">
                  {show.flyer ? (
                    <Image
                      src={show.flyer}
                      alt=""
                      fill
                      sizes="80px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink/40 text-xs text-center px-2">
                      No flyer
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-ink/50 text-xs font-mono uppercase tracking-widest mb-1">
                    {show.date}
                  </p>
                  <h2 className="text-lg font-bold leading-tight truncate">{show.title}</h2>
                  {show.bands.length > 0 && (
                    <p className="text-ink/60 text-sm truncate mt-0.5">{show.bands.join(', ')}</p>
                  )}
                </div>
              </Link>
            </section>
          );
        }

        return (
          <section
            key={show.slug}
            className="border-2 border-ink bg-paper-deep p-4 sm:p-5"
          >
            <div className="mb-5 pb-3 border-b border-ink/15">
              <ShowHeader show={show} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {show.videos.map((video, i) => (
                <VideoCard key={`${video.youtube}-${i}`} video={video} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
