import Link from 'next/link';

// Birdhaus DS — Menu Item (Figma 246:77): one row of the mobile menu. A
// channel-style index (Data/Label 11 Bold, text-meta) and a large label
// (Header/1), space-6 above, then a 1px line-ink rule under the row. Active
// turns index + label accent-red and shows a 4px accent-red segment exactly the
// label's width, sitting on the rule (space-3 under the label) — the same idea
// as the desktop Rail Nav Item. External shows ↗ (Header/3) at the right end,
// for links that leave the site (Song Club). The index and ↗ are decorative,
// so the link's name is just its label. Tokens / spacing scale only.

export type MenuItemProps = {
  index: string;
  label: string;
  href: string;
  active?: boolean;
  external?: boolean;
  onNavigate?: () => void;
};

export function MenuItem({
  index,
  label,
  href,
  active = false,
  external = false,
  onNavigate,
}: MenuItemProps) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="focus-visible:outline-accent-red flex flex-col focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="flex items-end justify-between gap-4 pt-6">
          <span className="flex min-w-0 items-end gap-4">
            <span
              aria-hidden="true"
              className={
                'text-data-label-11 pb-5 leading-normal font-bold tracking-[--spacing(0.375)] ' +
                (active ? 'text-accent-red' : 'text-text-meta')
              }
            >
              {index}
            </span>
            <span className="flex min-w-0 flex-col gap-3">
              <span
                className={
                  'text-header-1 leading-normal whitespace-nowrap ' +
                  (active ? 'text-accent-red' : 'text-text-primary')
                }
              >
                {label}
              </span>
              <span
                aria-hidden="true"
                className={`bg-accent-red h-1 ${active ? '' : 'opacity-0'}`}
              />
            </span>
          </span>
          {external && (
            <span aria-hidden="true" className="text-header-3 text-text-primary pb-4 leading-normal">
              ↗
            </span>
          )}
        </span>
        <span aria-hidden="true" className="bg-line-ink h-px" />
      </Link>
    </li>
  );
}

export default MenuItem;
