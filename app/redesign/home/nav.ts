import type { RailNavEntry } from '@/components/ui/RailNav';
import { portalRedirect } from '@/lib/site';

export const TAGLINE = 'A HUMBLE DIY MUSIC EMPIRE IN SOUTH MINNEAPOLIS';

// Header nav. `match` = the route prefixes that make an item active (see
// activeRailItem); any other route gets no active item.
export const NAV: RailNavEntry[] = [
  { label: 'VENUE', href: '/redesign/home', match: ['/redesign/home', '/upcoming', '/shows'] },
  { label: 'ARCHIVE', href: '/redesign/archive', match: ['/redesign/archive', '/archive', '/videos', '/photos', '/bands'] },
  // No 2027 Label page yet.
  { label: 'LABEL', href: '#', match: [] },
  // Links out to the Song Club portal (Song Club, Yellow Ostrich): the portal
  // host when the domain split is on, /song-club on this origin until then.
  // Never active here.
  { label: 'SONG CLUB', href: portalRedirect('/song-club'), match: [], external: true },
  { label: 'ABOUT/CONTACT', href: '/contact', match: ['/contact'] },
];
