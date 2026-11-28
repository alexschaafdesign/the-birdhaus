'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { imageSource } from '@/lib/image-source';

interface GalleryBand {
  id: number;
  slug: string;
  name: string;
  photo?: string;
  isTouring: boolean;
  hometown?: string;
  playCount: number;
}

export default function BandsGallery({ bands }: { bands: GalleryBand[] }) {
  // Only bands on at least one show; a band added in admin but not on any
  // show yet stays off the public gallery.
  const visible = useMemo(() => bands.filter((b) => b.playCount > 0), [bands]);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-body-3 flex flex-col gap-2 leading-normal">
        <p>{`Every artist that's played the Birdhaus (${visible.length}).`}</p>
      </div>

      {visible.length === 0 ? (
        <p className="text-body-3">No bands yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((band) => (
            <li key={band.id}>
              <Link
                href={`/bands/${band.slug}`}
                className="group focus-visible:outline-accent-red flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <div className="border-surface-ink bg-surface-paper-shade relative aspect-square overflow-hidden border">
                  {band.photo ? (
                    <Image
                      {...imageSource(band.photo, 400)}
                      alt=""
                      fill
                      // Tile widths for the 2 / 3 / 4 / 6-column grid.
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 17vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-header-2 flex h-full w-full items-center justify-center font-bold opacity-30">
                      {band.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-ui-nav-item-14 group-hover:text-accent-red truncate leading-[1.3] tracking-[--spacing(0.25)] uppercase">
                  {band.name}
                </span>
                {band.isTouring && (
                  <span className="text-data-spec-12 -mt-1.5 truncate uppercase opacity-70">
                    Touring{band.hometown ? ` · ${band.hometown}` : ''}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
