'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The tabs are a small rail: accent-red on the active tab, as the public RailNav.
const CLS = {
  nav: 'flex gap-5 overflow-x-auto text-body-3 border-b-2 border-surface-ink',
  active: 'pb-2 -mb-0.5 border-b-4 border-accent-red text-accent-red font-bold flex shrink-0 items-center',
  idle: 'pb-2 -mb-0.5 border-b-4 border-transparent hover:text-accent-red flex shrink-0 items-center',
  badge: 'ml-1.5 inline-flex items-center border px-1.5 text-data-label-10-small font-bold leading-4 tabular-nums',
  good: 'border-surface-ink bg-surface-ink text-surface-paper',
  neutral: 'border-surface-ink text-surface-ink',
};

// Progress signals shown as small pills next to the tab labels, so the tab bar
// doubles as a where-am-I checklist for the show.
export interface ShowTabBadges {
  inviteSent: boolean;
  // null when the show has no (non-excluded) bands yet.
  inputs: { done: number; total: number } | null;
  rsvpCount: number;
  settlementSaved: boolean;
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good';
}) {
  const cls = tone === 'good' ? CLS.good : CLS.neutral;
  return (
    <span className={`${CLS.badge} ${cls}`}>
      {children}
    </span>
  );
}

// Tab nav for the per-show workspace, ordered along the show's lifecycle:
// set it up (Details) → get the lineup ready (Portal, Inputs) → the night
// (RSVPs, TV) → after (Settlement). Details is the base route, so it's only
// active on an exact match; the others match their path prefix.
export default function ShowTabs({ id, badges }: { id: number; badges?: ShowTabBadges }) {
  const pathname = usePathname();
  const base = `/admin/shows/${id}`;
  // Portal is the admin home for everything band-facing: the portal content,
  // the message thread, and sending the invite email (what used to be the
  // separate "Advance" tab — that route now redirects here).
  const tabs: Array<{ href: string; label: string; exact: boolean; badge?: React.ReactNode }> = [
    { href: base, label: 'Details', exact: true },
    { href: `${base}/crew`, label: 'Crew', exact: false },
    {
      href: `${base}/portal`,
      label: 'Portal',
      exact: false,
      badge: badges?.inviteSent ? <Badge tone="good">✓ sent</Badge> : undefined,
    },
    {
      href: `${base}/inputs`,
      label: 'Inputs',
      exact: false,
      badge: badges?.inputs ? (
        <Badge tone={badges.inputs.done >= badges.inputs.total ? 'good' : 'neutral'}>
          {badges.inputs.done}/{badges.inputs.total}
        </Badge>
      ) : undefined,
    },
    {
      href: `${base}/rsvps`,
      label: 'RSVPs',
      exact: false,
      badge: badges && badges.rsvpCount > 0 ? <Badge>{badges.rsvpCount}</Badge> : undefined,
    },
    { href: `${base}/tv`, label: 'TV', exact: false },
    {
      href: `${base}/settlement`,
      label: 'Settlement',
      exact: false,
      badge: badges?.settlementSaved ? <Badge tone="good">✓</Badge> : undefined,
    },
  ];

  return (
    <nav aria-label="Show sections" className={CLS.nav}>
      {tabs.map(({ href, label, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={active ? CLS.active : CLS.idle}
          >
            {label}
            {badge}
          </Link>
        );
      })}
    </nav>
  );
}
