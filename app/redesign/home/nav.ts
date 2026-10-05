import type { RailNavEntry } from '@/components/ui/RailNav';
import { portalRedirect } from '@/lib/site';

// Header nav. `match` = the route prefixes that make an item active (see
// activeRailItem); any other route gets no active item.
export const NAV: RailNavEntry[] = [
  { label: 'VENUE', href: '/redesign/home', match: ['/redesign/home', '/upcoming', '/shows'] },
  { label: 'ARCHIVE', href: '/archive', match: ['/archive', '/videos', '/photos', '/bands'] },
  // No 2027 Label page yet.
  { label: 'LABEL', href: '#', match: [] },
  // Links out to the Fresh Cuts site (Song Club, Yellow Ostrich): the portal
  // host when the domain split is on, /song-club on this origin until then.
  // Never active here.
  { label: 'FRESH CUTS', href: portalRedirect('/song-club'), match: [] },
  { label: 'ABOUT/CONTACT', href: '/contact', match: ['/contact'] },
];
