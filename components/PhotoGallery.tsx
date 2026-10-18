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
      {/* Square corners (2027). Each photo is a button so the lightbox opens
          from the keyboard too. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((photo, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setIndex(idx);
              setOpen(true);
            }}
            className="focus-visible:outline-accent-red block cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Image
              src={photo.url}
              alt={`${showTitle} photo ${idx + 1}`}
              width={0}
              height={0}
              sizes="(max-width: 768px) 50vw, 33vw"
              unoptimized
              className="h-auto w-full transition-opacity hover:opacity-80"
            />
          </button>
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
