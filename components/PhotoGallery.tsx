'use client';

import { useState } from 'react';
import Image from 'next/image';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

export default function PhotoGallery({ photos, showTitle }: { photos: string[]; showTitle: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const slides = photos.map((photo) => ({ src: photo }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {photos.map((photo, idx) => (
          <Image
            key={idx}
            src={photo}
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
      />
    </>
  );
}