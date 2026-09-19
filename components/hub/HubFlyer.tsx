'use client';

import { useEffect, useState } from 'react';

// The show flyer as a small preview thumbnail (sits left of the page header)
// that opens a full-size lightbox on click. Click anywhere or press Escape to
// close. Plain <img> both places — flyers are Cloudinary URLs, same as before.
export default function HubFlyer({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Keep the page from scrolling behind the lightbox while it's up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View flyer full size"
        className="group shrink-0 cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-24 sm:w-32 rounded-lg border border-[#E8E0D0]/15 transition-colors group-hover:border-[#c8a26a]/60"
        />
        <span className="mt-1 block text-center text-[10px] text-[#E8E0D0]/40 group-hover:text-[#E8E0D0]/70 transition-colors">
          flyer ⤢
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close flyer"
            className="absolute right-4 top-4 rounded-full bg-[#E8E0D0]/10 px-3 py-1.5 text-sm text-[#E8E0D0]/80 hover:bg-[#E8E0D0]/20 hover:text-[#E8E0D0]"
          >
            ✕ close
          </button>
        </div>
      )}
    </>
  );
}
