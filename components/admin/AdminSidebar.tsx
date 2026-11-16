'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_NAV, activeAdminGroup, adminLinkActive } from './nav';
import { ADMIN_TYPE } from './ui/styles';

// The 2027 admin nav: a left sidebar on desktop (lg+), with every section's
// links visible under its overline. Below lg it folds into a Menu bar showing
// where you are, which opens the same list in place. Tokens only.
//   Default  ink label
//   Hover    paper-shade row
//   Active   accent-red bold label, 4px accent-red bar on the left, paper-shade
//            row, aria-current="page"

function NavList({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-4 py-4">
      {ADMIN_NAV.map((group) => (
        <li key={group.label}>
          <p className={`${ADMIN_TYPE.overline} text-surface-ink/60 mb-1 px-4`}>{group.label}</p>
          <ul>
            {group.links.map((link) => {
              const active = adminLinkActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={`text-body-3 block border-l-4 py-1 pr-4 pl-3 leading-normal ${ADMIN_TYPE.focus} focus-visible:-outline-offset-2 ${
                      active
                        ? 'border-accent-red bg-surface-paper-shade text-accent-red font-bold'
                        : 'hover:bg-surface-paper-shade border-transparent'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  // Open for one pathname only, so following a link closes the phone menu
  // without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const group = activeAdminGroup(pathname);
  const page = group?.links.find((link) => adminLinkActive(pathname, link.href));
  const here = group && page ? (group.label === page.label ? page.label : `${group.label} / ${page.label}`) : 'Home';

  return (
    <>
      <nav
        aria-label="Admin"
        className="border-surface-ink hidden border-r-2 lg:sticky lg:top-0 lg:block lg:max-h-screen lg:overflow-y-auto"
      >
        <NavList pathname={pathname} />
      </nav>

      <div className="border-surface-ink border-b-2 lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpenFor(open ? null : pathname)}
          className={`flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 ${ADMIN_TYPE.focus} focus-visible:-outline-offset-2`}
        >
          <span className="text-body-3 truncate font-bold">{here}</span>
          <span className={ADMIN_TYPE.overline}>{open ? 'Close ×' : 'Menu ☰'}</span>
        </button>
        {open && (
          <nav id="admin-menu" aria-label="Admin" className="border-surface-ink border-t">
            <NavList pathname={pathname} />
          </nav>
        )}
      </div>
    </>
  );
}

export default AdminSidebar;
