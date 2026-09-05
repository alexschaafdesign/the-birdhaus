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

export default function Header({ isAdmin }: { isAdmin?: boolean }) {
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

  // The /redesign broadcast homepage carries its own header band and owns the
  // whole viewport — suppress the shared logo band + nav there.
  if (pathname.startsWith('/redesign')) return null;

  // The home page runs the venue photo as a full-page dark background, so the
  // header goes transparent there and the nav flips to cream-on-dark.
  const onPhoto = pathname === '/';

  const linkClass = (isActive: boolean) =>
    onPhoto
      ? `block w-full text-center border-2 border-paper/40 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors hover:border-paper hover:bg-paper hover:text-ink md:w-auto md:border-0 md:p-0 md:text-sm md:tracking-wider md:hover:bg-transparent md:hover:text-paper md:hover:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4${isActive ? ' bg-paper text-ink font-bold md:bg-transparent md:text-paper md:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4' : ''}`
      : `block w-full text-center border-2 border-ink/40 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors hover:border-ink hover:bg-ink hover:text-paper md:w-auto md:border-0 md:p-0 md:text-sm md:tracking-wider md:hover:bg-transparent md:hover:text-ink md:hover:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4${isActive ? ' bg-ink text-paper font-bold md:bg-transparent md:text-ink md:underline md:decoration-vhs-red md:decoration-2 md:underline-offset-4' : ''}`;

  const dividerClass = onPhoto ? 'bg-paper/30' : 'bg-ink/20';

  const initial = me ? me.firstName.charAt(0).toUpperCase() || '?' : '?';
  // The admin dashboard has its own nav + logout (AdminNav/LogoutButton), so
  // skip the header's auth area there to avoid a duplicate account menu.
  const showAuth = !pathname.startsWith('/admin');

  return (
    <header className="relative z-30 pb-5">
      {/* Ink band behind the cream logo — the "tape shell" above the paper
          label. On the photo-background home page the band is transparent. */}
      <div className={`px-8 pt-6 pb-6 ${onPhoto ? '' : 'bg-[#1A1712]'}`}>
        {/* Auth area, top-right. The band (or photo scrim) is dark in both
            header modes, so this keeps the cream-on-dark treatment. */}
        <div className="absolute right-4 top-4 text-paper sm:right-8 sm:top-6">
          {!showAuth || me === undefined ? null : me === null ? (
            <Link
              href="/login"
              className="rounded border border-paper/30 px-3 py-1.5 text-sm transition-colors hover:border-paper hover:bg-paper/5"
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
                className="flex items-center gap-2 rounded-full border border-paper/30 py-1 pl-1 pr-3 text-sm transition-colors hover:border-paper hover:bg-paper/5"
              >
                {me.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper/15 text-xs">
                    {initial}
                  </span>
                )}
                <span className="hidden sm:inline">{me.firstName}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-40 pt-2">
                  <div className="min-w-[10rem] whitespace-nowrap border-2 border-ink bg-paper py-1.5 text-ink shadow-hard">
                    {me.canAdmin && (
                      <Link
                        href="/admin"
                        className="block px-4 py-2 text-left text-sm hover:bg-ink hover:text-paper"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                    )}
                    <Link
                      href="/account"
                      className="block px-4 py-2 text-left text-sm hover:bg-ink hover:text-paper"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Account settings
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-ink hover:text-paper"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
