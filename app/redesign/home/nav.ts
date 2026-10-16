import type { RailNavEntry } from '@/components/ui/RailNav';
import { SONGHAUS_URL } from '@/lib/site';

export const TAGLINE = 'A HUMBLE DIY MUSIC EMPIRE IN SOUTH MINNEAPOLIS';

// Header nav. `match` = the route prefixes that make an item active (see
// activeRailItem); any other route gets no active item.
export const NAV: RailNavEntry[] = [
  // /shows/[id] is one URL per night: VENUE while it's ahead; an archived
  // night lights ARCHIVE instead (SiteFrame's navPath override).
  { label: 'VENUE', href: '/redesign/home', match: ['/redesign/home', '/upcoming', '/shows'] },
  { label: 'ARCHIVE', href: '/archive', match: ['/archive', '/videos', '/photos', '/bands'] },
  // No 2027 Label page yet.
  { label: 'LABEL', href: '#', match: [] },
  // Links out to Songhaus (what Song Club became). Never active here.
  { label: 'SONGHAUS', href: SONGHAUS_URL, match: [], external: true },
  { label: 'ABOUT/CONTACT', href: '/contact', match: ['/contact'] },
];
