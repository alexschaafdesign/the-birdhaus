import type { RailNavEntry } from '@/components/ui/RailNav';
import { SONGHAUS_URL } from '@/lib/site';

export const TAGLINE = 'A HUMBLE DIY MUSIC EMPIRE IN SOUTH MINNEAPOLIS';

// The path the nav treats as current on the Fresh Cuts view of the archive
// (/archive?series=fc). activeRailItem matches paths only, so the archive
// passes this as SiteFrame's navPath when series=fc.
export const FRESH_CUTS_NAV_PATH = '/fresh-cuts';

// Header nav. `match` = the route prefixes that make an item active (see
// activeRailItem); any other route gets no active item. '/' only matches
// exactly, so it never claims the whole site.
export const NAV: RailNavEntry[] = [
  // /shows/[id] is one URL per night: VENUE while it's ahead; an archived
  // night lights ARCHIVE instead (SiteFrame's navPath override).
  { label: 'VENUE', href: '/', match: ['/', '/shows'] },
  { label: 'ARCHIVE', href: '/archive', match: ['/archive', '/videos', '/photos', '/bands'] },
  // LABEL stays out until /label exists (after launch):
  // { label: 'LABEL', href: '/label', match: ['/label'] },
  { label: 'FRESH CUTS', href: '/archive?series=fc', match: [FRESH_CUTS_NAV_PATH] },
  { label: 'ABOUT/CONTACT', href: '/contact', match: ['/contact'] },
  // Links out to Songhaus (what Song Club became). Never active here.
  { label: 'SONGHAUS', href: SONGHAUS_URL, match: [], external: true },
];
