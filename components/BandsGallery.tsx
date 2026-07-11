'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

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
        <p className="text-[#E8E0D0]/70">
          {showAll
            ? 'Every artist in the Twin Cities scene database.'
            : "Every artist that's played the Birdhaus."}
        </p>
        <label className="flex items-center gap-2 text-sm text-[#E8E0D0]/70 select-none mt-2 w-fit">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all Twin Cities bands (in-progress)
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-[#E8E0D0]/60">No bands yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {visible.map((band) => (
            <Link key={band.id} href={`/bands/${band.slug}`} className="group block">
              <div className="aspect-square rounded-lg overflow-hidden bg-[#E8E0D0]/5 border border-[#E8E0D0]/15 group-hover:border-[#E8E0D0]/50 transition-colors">
                {band.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={band.photo}
                    alt={band.name}
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl font-bold text-[#E8E0D0]/20">
                      {band.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center font-medium truncate group-hover:text-[#E8E0D0]/70 transition-colors">
                {band.name}
              </p>
              {band.isTouring && (
                <p className="text-center text-xs text-[#E8E0D0]/40 truncate">
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
