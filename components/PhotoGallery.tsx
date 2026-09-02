'use client';

import { useState } from 'react';
import Image from 'next/image';
import Lightbox from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/captions.css';

export interface GalleryPhoto {
  url: string;
  // Resolved photographer credit for this specific photo, or null if uncredited.
  credit?: { name: string; instagram?: string | null } | null;
}

export default function PhotoGallery({ photos, showTitle }: { photos: GalleryPhoto[]; showTitle: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Per-photo credit is shown in the lightbox caption; a gallery-wide "Photos
  // by" line (rendered by the page above the grid) covers the uniform case.
  const slides = photos.map((photo) => ({
    src: photo.url,
    description: photo.credit ? `Photo by ${photo.credit.name}` : undefined,
  }));

  const anyCredited = photos.some((photo) => photo.credit);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {photos.map((photo, idx) => (
          <Image
            key={idx}
            src={photo.url}
            alt={`${showTitle} photo ${idx + 1}`}
            width={0}
            height={0}
            sizes="(max-width: 768px) 50vw, 33vw"
            unoptimized
            className="w-full h-auto rounded cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              setIndex(idx);
              setOpen(true);
            }}
          />
        ))}
      </div>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        slides={slides}
        index={index}
        // Only wire up captions when at least one photo carries a credit, so
        // uncredited galleries render exactly as before.
        plugins={anyCredited ? [Captions] : []}
        captions={{ showToggle: false, descriptionTextAlign: 'center' }}
      />
    </>
  );
}
