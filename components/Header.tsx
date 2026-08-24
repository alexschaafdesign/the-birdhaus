'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cloudinaryTransform } from '@/lib/cloudinary-url';

const LOGO_URL = cloudinaryTransform(
  'https://res.cloudinary.com/defdv9zw7/image/upload/v1780325979/Horiz_mkva70.png',
  768
);

type NavLink = { type: 'link'; href: string; label: string; external?: boolean };
type NavDropdown = {
  type: 'dropdown';
  label: string;
  children: { href: string; label: string; external?: boolean }[];
};
type NavItem = NavLink | NavDropdown;

const navItems: NavItem[] = [
  { type: 'link', href: '/upcoming', label: 'Upcoming Shows' },
  { type: 'link', href: '/archive', label: 'Archive' },
  {
    type: 'dropdown',
    label: 'Projects',
    children: [
      { href: 'https://birdhausrecords.bandcamp.com', label: 'Birdhaus Records', external: true },
      { href: 'https://twinscene.org', label: 'Twin Scene', external: true },
      { href: '/song-club', label: 'Song Club' },
      { href: '/fresh-cuts', label: 'Fresh Cuts' },
    ],
  },
  { type: 'link', href: '/contact', label: 'Contact' },
];

export default function Header({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openDropdown]);

  // The door check-in kiosk is a standalone full-screen view — no site chrome.
  if (pathname.startsWith('/door')) return null;

  // The home page runs the venue photo as a full-page dark background, so the
  // header goes transparent there and the nav flips to cream-on-dark.
  const onPhoto = pathname === '/';

  const linkClass = (isActive: boolean) =>
    onPhoto
      ? `block w-full text-center border-2 border-paper/40 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors hover:border-paper hover:bg-paper hover:text-ink md:w-auto md:border-0 md:p-0 md:text-sm md:tracking-wider md:hover:bg-transparent md:hover:text-paper md:hover:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4${isActive ? ' bg-paper text-ink font-bold md:bg-transparent md:text-paper md:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4' : ''}`
      : `block w-full text-center border-2 border-ink/40 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors hover:border-ink hover:bg-ink hover:text-paper md:w-auto md:border-0 md:p-0 md:text-sm md:tracking-wider md:hover:bg-transparent md:hover:text-ink md:hover:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4${isActive ? ' bg-ink text-paper font-bold md:bg-transparent md:text-ink md:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4' : ''}`;

  const dividerClass = onPhoto ? 'bg-paper/30' : 'bg-ink/20';

  return (
    <header className="pb-5">
      {/* Ink band behind the cream logo — the "tape shell" above the paper
          label. On the photo-background home page the band is transparent. */}
      <div className={`px-8 pt-6 pb-6 ${onPhoto ? '' : 'bg-[#1A1712]'}`}>
        <Link href="/" className="mx-auto block w-full max-w-sm">
          <Image
            src={LOGO_URL}
            alt="The Birdhaus"
            width={0}
            height={0}
            sizes="384px"
            priority
            unoptimized
            className="w-full h-auto"
          />
        </Link>
      </div>
      <div className="vhs-stripes h-1.5 w-full" aria-hidden="true" />
      <nav className={`mt-5 px-8 grid grid-cols-2 gap-2 md:flex md:flex-row md:items-center md:justify-center md:gap-6 text-sm max-w-sm md:max-w-none mx-auto ${onPhoto ? 'text-paper' : ''}`}>
        {navItems.map((item, i) => {
          const isLast = i === navItems.length - 1;
          const wrapperClass = `flex items-center md:gap-6${isLast && navItems.length % 2 === 1 ? ' col-span-2 md:col-auto' : ''}`;

          if (item.type === 'dropdown') {
            return (
              <span key={item.label} className={wrapperClass}>
                <div
                  ref={dropdownRef}
                  // `flex` so the button is a flex item, not an inline box on a
                  // text baseline — otherwise it sits a few px off the sibling links.
                  className="relative flex w-full md:w-auto"
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setOpenDropdown(true);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setOpenDropdown(false);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((open) => !open)}
                    aria-expanded={openDropdown}
                    className={`${linkClass(false)} inline-flex items-center justify-center gap-1.5`}
                  >
                    {item.label}
                    <svg
                      viewBox="0 0 12 8"
                      className={`h-2.5 w-2.5 shrink-0 fill-current transition-transform ${openDropdown ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {openDropdown && (
                    <div className="absolute left-0 top-full z-40 pt-2.5">
                      <div className="whitespace-nowrap border-2 border-ink bg-paper py-1.5 shadow-hard">
                        {item.children.map((child) => {
                          const childClass =
                            'block px-6 py-2.5 text-left hover:bg-ink hover:text-paper';
                          return child.external ? (
                            <a
                              key={child.href}
                              href={child.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={childClass}
                              onClick={() => setOpenDropdown(false)}
                            >
                              {child.label}
                            </a>
                          ) : (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={childClass}
                              onClick={() => setOpenDropdown(false)}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {!isLast && <span className={`hidden h-4 w-px md:inline-block ${dividerClass}`} aria-hidden="true" />}
              </span>
            );
          }

          const isActive = !item.external && pathname === item.href;
          return (
            <span key={item.href} className={wrapperClass}>
              {item.external ? (
                <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkClass(isActive)}>
                  {item.label}
                </a>
              ) : (
                <Link href={item.href} className={linkClass(isActive)}>
                  {item.label}
                </Link>
              )}
              {!isLast && <span className={`hidden h-4 w-px md:inline-block ${dividerClass}`} aria-hidden="true" />}
            </span>
          );
        })}
        {isAdmin && !pathname.startsWith('/admin') && (
          <Link
            href="/admin"
            title="Admin view — showing drafts & available dates"
            className="col-span-2 justify-self-center self-center bg-yellow-400 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-yellow-300 md:col-auto"
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}
