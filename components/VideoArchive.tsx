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
  photos: string[];
};

const PHOTO_PREVIEW_LIMIT = 5;

function PhotoStrip({ show }: { show: ArchiveShowGroup }) {
  const preview = show.photos.slice(0, PHOTO_PREVIEW_LIMIT);
  const total = show.photos.length;
  const extra = total - preview.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#E8E0D0]/50 text-xs font-mono uppercase tracking-widest">
          Photos
        </p>
        <Link
          href={`/shows/${show.slug}#photos`}
          className="text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0] transition-colors"
        >
          See all {total} →
        </Link>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {preview.map((url, i) => {
          const isLast = i === preview.length - 1;
          return (
            <Link
              key={`${url}-${i}`}
              href={`/shows/${show.slug}#photos`}
              className="group relative aspect-square rounded overflow-hidden bg-[#E8E0D0]/10"
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(min-width: 640px) 20vw, 33vw"
                unoptimized
                className="object-cover transition-opacity group-hover:opacity-80"
              />
              {isLast && extra > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[#E8E0D0] text-sm font-medium">
                  +{extra}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: ArchiveVideo }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="border border-[#E8E0D0]/20 rounded-lg overflow-hidden bg-[#E8E0D0]/[0.02]">
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
              <span className="flex items-center justify-center w-16 h-16 rounded-full bg-black/60 group-hover:bg-red-600 transition-colors">
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white translate-x-0.5" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium leading-snug">{video.title}</h3>
      </div>
    </div>
  );
}

function ShowHeader({ show }: { show: ArchiveShowGroup }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[#E8E0D0]/50 text-xs font-mono uppercase tracking-widest mb-1">
        {show.date}
      </p>
      <h2 className="text-2xl font-bold leading-tight">
        <Link href={`/shows/${show.slug}`} className="hover:text-[#E8E0D0]/70 transition-colors">
          {show.title}
        </Link>
      </h2>
      {show.bands.length > 0 && (
        <p className="text-[#E8E0D0]/60 text-sm">{show.bands.join(', ')}</p>
      )}
    </div>
  );
}

export default function VideoArchive({ groups }: { groups: ArchiveShowGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((show) => {
        const hasVideos = show.videos.length > 0;
        const hasPhotos = show.photos.length > 0;

        // Shows with neither videos nor photos still hold their place in the
        // timeline, but render as a lighter row (flyer + header) instead of a
        // full media card.
        if (!hasVideos && !hasPhotos) {
          return (
            <section key={show.slug}>
              <Link
                href={`/shows/${show.slug}`}
                className="flex gap-5 items-center rounded-lg border border-[#E8E0D0]/10 p-4 hover:border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/5 transition-colors"
              >
                <div className="relative w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-[#E8E0D0]/10">
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
                    <div className="w-full h-full flex items-center justify-center text-[#E8E0D0]/40 text-xs text-center px-2">
                      No flyer
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[#E8E0D0]/50 text-xs font-mono uppercase tracking-widest mb-1">
                    {show.date}
                  </p>
                  <h2 className="text-xl font-bold leading-tight truncate">{show.title}</h2>
                  {show.bands.length > 0 && (
                    <p className="text-[#E8E0D0]/60 text-sm truncate mt-0.5">{show.bands.join(', ')}</p>
                  )}
                </div>
              </Link>
            </section>
          );
        }

        return (
          <section
            key={show.slug}
            className="rounded-lg border border-[#E8E0D0]/10 bg-[#E8E0D0]/[0.02] p-4 sm:p-5"
          >
            <div className="mb-5 pb-3 border-b border-[#E8E0D0]/15">
              <ShowHeader show={show} />
            </div>
            {hasVideos && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {show.videos.map((video, i) => (
                  <VideoCard key={`${video.youtube}-${i}`} video={video} />
                ))}
              </div>
            )}
            {hasPhotos && (
              <div className={hasVideos ? 'mt-6 pt-5 border-t border-[#E8E0D0]/15' : ''}>
                <PhotoStrip show={show} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
