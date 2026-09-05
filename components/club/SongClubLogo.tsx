'use client';

import { useEffect, useState } from 'react';

// The Song Club logo, clickable to view full-screen over a scrim (like a photo
// lightbox). Close by clicking the scrim, hitting Escape, or the ✕. Kept as a
// small self-contained component so the same behavior drops into every header.
export default function SongClubLogo({ className = 'h-16 w-16' }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the overlay is up.
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
        aria-label="View Song Club logo"
        className={`${className} shrink-0 overflow-hidden rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8E0D0]/60`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/song-club-logo.png" alt="Song Club" className="h-full w-full object-cover" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Song Club logo"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 text-3xl leading-none text-white/70 transition hover:text-white"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/song-club-logo.png"
            alt="Song Club"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-full object-contain"
          />
        </div>
      )}
    </>
  );
}
