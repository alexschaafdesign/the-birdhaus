'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/upcoming', label: 'Upcoming Shows' },
  { href: '/archive', label: 'Archive' },
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
      <nav className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-sm">
        {navLinks.map((link, i) => {
          const isActive = !link.external && pathname === link.href;
          const className = `hover:underline${isActive ? ' font-semibold' : ''}`;
          return (
            <span key={link.href} className="flex items-center gap-2 md:gap-6">
              {link.external ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {link.label}
                </a>
              ) : (
                <Link href={link.href} className={className}>
                  {link.label}
                </Link>
              )}
              {i < navLinks.length - 1 && <span className="hidden md:inline">•</span>}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
