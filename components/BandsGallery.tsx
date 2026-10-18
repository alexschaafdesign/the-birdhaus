'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? bands : bands.filter((b) => b.playCount > 0)),
    [bands, showAll]
  );

  const playedCount = bands.filter((b) => b.playCount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-body-3 flex flex-col gap-2 leading-normal">
        <p>
          {showAll
            ? 'Every artist in the Twin Cities scene database.'
            : `Every artist that's played the Birdhaus (${playedCount}).`}
        </p>
        <label className="flex w-fit items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="accent-surface-ink size-4"
          />
          Show all Twin Cities bands (in-progress)
        </label>
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
                      src={band.photo}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 17vw"
                      unoptimized
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
