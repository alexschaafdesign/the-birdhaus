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

  return (
    <div>
      <div className="mb-10">
        <p className="text-ink/70">
          {showAll
            ? 'Every artist in the Twin Cities scene database.'
            : "Every artist that's played the Birdhaus."}
        </p>
        <label className="flex items-center gap-2 text-sm text-ink/70 select-none mt-2 w-fit">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all Twin Cities bands (in-progress)
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-ink/60">No bands yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {visible.map((band) => (
            <Link key={band.id} href={`/bands/${band.slug}`} className="group block">
              <div className="relative aspect-square overflow-hidden bg-ink/5 border-2 border-ink transition-all group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-hard">
                {band.photo ? (
                  <Image
                    src={band.photo}
                    alt={band.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl font-bold text-ink/20">
                      {band.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center font-medium truncate group-hover:text-vhs-red transition-colors">
                {band.name}
              </p>
              {band.isTouring && (
                <p className="text-center font-mono text-xs text-ink/40 truncate">
                  Touring{band.hometown ? ` · ${band.hometown}` : ''}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
