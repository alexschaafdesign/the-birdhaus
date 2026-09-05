'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Classic top-right account menu: a pill showing the member's avatar + name,
// opening a dropdown with Account and Log out. Falls back to a blank avatar
// placeholder when no image is uploaded. Closes on outside-click / Escape.
export default function ClubUserMenu({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] py-1 pl-1 pr-3 text-sm text-[#E8E0D0] transition hover:border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/[0.08]"
      >
        <Avatar name={name} avatarUrl={avatarUrl} />
        <span className="max-w-[10rem] truncate font-medium">{name}</span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-[#E8E0D0]/50 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-[#E8E0D0]/15 bg-[#2A2420] shadow-xl"
        >
          <Link
            href="/song-club/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/[0.06]"
          >
            Account
          </Link>
          <form action="/api/club/logout" method="post" className="border-t border-[#E8E0D0]/10">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-[#E8E0D0]/85 transition hover:bg-[#E8E0D0]/[0.06]"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#E8E0D0]/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  // Blank avatar placeholder — neutral circle with a person glyph.
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E8E0D0]/20 bg-[#E8E0D0]/10"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#E8E0D0]/40" fill="currentColor">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.6 0-7 1.9-7 4.5V20h14v-1.5c0-2.6-3.4-4.5-7-4.5Z" />
      </svg>
    </span>
  );
}
