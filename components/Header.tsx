'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cloudinaryTransform } from '@/lib/cloudinary-url';

// Minimal current-user summary the header fetches from /api/club/me. `undefined`
// while loading (render nothing to avoid a flash), `null` when logged out.
type HeaderMe = { name: string; firstName: string; avatarUrl: string | null; canAdmin: boolean };

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
  { type: 'link', href: '/song-club', label: 'Song Club' },
  {
    type: 'dropdown',
    label: 'Projects',
    children: [
      { href: 'https://birdhausrecords.bandcamp.com', label: 'Birdhaus Records', external: true },
      { href: 'https://twinscene.org', label: 'Twin Scene', external: true },
      { href: '/fresh-cuts', label: 'Fresh Cuts' },
    ],
  },
  { type: 'link', href: '/contact', label: 'Contact' },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auth area (top-right): who's logged in, plus its own little dropdown.
  const [me, setMe] = useState<HeaderMe | null | undefined>(undefined);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Load the current user once per mount. Best-effort — a failure just leaves
  // the Log in button showing.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/club/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { member: null }))
      .then((data) => {
        if (!cancelled) setMe(data?.member ?? null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [userMenuOpen]);

  async function handleLogout() {
    await fetch('/api/club/logout', { method: 'POST' }).catch(() => {});
    setMe(null);
    setUserMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  // The door check-in kiosk and the in-venue TV are standalone full-screen
  // views — no site chrome.
  if (pathname.startsWith('/door') || pathname.startsWith('/tv')) return null;

  const linkClass = (isActive: boolean) =>
    `block w-full text-center rounded border border-[#E8E0D0]/30 px-4 py-3 transition-colors hover:border-[#E8E0D0] hover:bg-[#E8E0D0]/5 md:w-auto md:rounded-none md:border-0 md:p-0 md:hover:bg-transparent md:hover:underline${isActive ? ' bg-[#E8E0D0]/10 font-semibold md:bg-transparent' : ''}`;

  const initial = me ? me.firstName.charAt(0).toUpperCase() || '?' : '?';
  // The admin dashboard has its own nav + logout (AdminNav/LogoutButton), so
  // skip the header's auth area there to avoid a duplicate account menu.
  const showAuth = !pathname.startsWith('/admin');

  return (
    <header className="relative pt-12 pb-8 px-8">
      <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
        {!showAuth || me === undefined ? null : me === null ? (
          <Link
            href="/login"
            className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm transition-colors hover:border-[#E8E0D0] hover:bg-[#E8E0D0]/5"
          >
            Log in
          </Link>
        ) : (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-expanded={userMenuOpen}
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full border border-[#E8E0D0]/30 py-1 pl-1 pr-3 text-sm transition-colors hover:border-[#E8E0D0] hover:bg-[#E8E0D0]/5"
            >
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8E0D0]/15 text-xs">
                  {initial}
                </span>
              )}
              <span className="hidden sm:inline">{me.firstName}</span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-40 pt-2">
                <div className="min-w-[10rem] whitespace-nowrap rounded-lg border border-[#E8E0D0]/20 bg-[#3A322B] py-1.5 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.7)]">
                  {me.canAdmin && (
                    <Link
                      href="/admin"
                      className="block px-4 py-2 text-left text-sm hover:bg-[#E8E0D0]/10"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                  )}
                  <Link
                    href="/account"
                    className="block px-4 py-2 text-left text-sm hover:bg-[#E8E0D0]/10"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Account settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-[#E8E0D0]/10"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center justify-center gap-4 mb-4">
        <Link href="/">
          <Image
            src={LOGO_URL}
            alt="The Birdhaus"
            width={0}
            height={0}
            sizes="384px"
            priority
            unoptimized
            className="w-full max-w-sm h-auto"
          />
        </Link>
      </div>
      <nav className="grid grid-cols-2 gap-2 md:flex md:flex-row md:items-center md:justify-center md:gap-6 text-sm max-w-sm md:max-w-none mx-auto">
        {navItems.map((item, i) => {
          const isLast = i === navItems.length - 1;
          const wrapperClass = `flex items-center md:gap-6${isLast && navItems.length % 2 === 1 ? ' col-span-2 md:col-auto' : ''}`;

          if (item.type === 'dropdown') {
            return (
              <span key={item.label} className={wrapperClass}>
                <div
                  ref={dropdownRef}
                  className="relative w-full md:w-auto"
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
                      <div className="whitespace-nowrap rounded-lg border border-[#E8E0D0]/20 bg-[#3A322B] py-1.5 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.7)]">
                        {item.children.map((child) => {
                          const childClass =
                            'block px-6 py-2.5 text-left hover:bg-[#E8E0D0]/10';
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
                {!isLast && <span className="hidden h-4 w-px bg-[#E8E0D0]/15 md:inline-block" aria-hidden="true" />}
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
              {!isLast && <span className="hidden h-4 w-px bg-[#E8E0D0]/15 md:inline-block" aria-hidden="true" />}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
