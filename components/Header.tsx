'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/upcoming', label: 'Upcoming Shows' },
  { href: '/archive', label: 'Archive' },
  { href: '/bands', label: 'Bands' },
  { href: '/videos', label: 'Video' },
  { href: 'https://birdhausrecords.bandcamp.com', label: 'Record Label', external: true },
  { href: '/contact', label: 'Contact' },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="pt-12 pb-8 px-8">
      <div className="flex flex-col items-center justify-center gap-4 mb-4">
        <Link href="/">
          <img
            src="https://res.cloudinary.com/defdv9zw7/image/upload/v1780325979/Horiz_mkva70.png"
            alt="The Birdhaus"
            className="w-full max-w-sm h-auto"
          />
        </Link>
      </div>
      <nav className="grid grid-cols-2 gap-2 md:flex md:flex-row md:items-center md:justify-center md:gap-6 text-sm max-w-sm md:max-w-none mx-auto">
        {navLinks.map((link, i) => {
          const isActive = !link.external && pathname === link.href;
          const isLast = i === navLinks.length - 1;
          const linkClass = `block w-full text-center rounded border border-[#E8E0D0]/30 px-4 py-3 transition-colors hover:border-[#E8E0D0] hover:bg-[#E8E0D0]/5 md:w-auto md:rounded-none md:border-0 md:p-0 md:hover:bg-transparent md:hover:underline${isActive ? ' bg-[#E8E0D0]/10 font-semibold md:bg-transparent' : ''}`;
          return (
            <span
              key={link.href}
              className={`flex items-center md:gap-6${isLast && navLinks.length % 2 === 1 ? ' col-span-2 md:col-auto' : ''}`}
            >
              {link.external ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {link.label}
                </a>
              ) : (
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              )}
              {!isLast && <span className="hidden md:inline">•</span>}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
