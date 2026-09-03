import Link from 'next/link';
import type { ComponentProps } from 'react';

// Birdhaus DS primitive — a styled nav link (next/link renders the <a>). Nothing
// but a token-driven className: --text-* for size, --color-* for ink/accent. The
// `active` flag marks the current page (visual + aria-current). No hex/px here.

const BASE =
  'font-berkeley text-ui-nav-item-14 tracking-wide transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-red';

export type NavLinkProps = ComponentProps<typeof Link> & { active?: boolean };

export function NavLink({ active = false, className = '', ...props }: NavLinkProps) {
  return (
    <Link
      {...props}
      aria-current={active ? 'page' : undefined}
      className={
        `${BASE} ` +
        (active ? 'text-accent-red' : 'text-surface-ink hover:text-accent-red') +
        ` ${className}`
      }
    />
  );
}

export default NavLink;
