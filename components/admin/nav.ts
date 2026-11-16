// The admin's sections, shared by the 2027 sidebar (AdminSidebar) and the old
// dark two-row nav (AdminNav) while pages move over one area at a time.

export interface AdminNavLink {
  href: string;
  label: string;
}

export interface AdminNavGroup {
  label: string;
  links: AdminNavLink[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Shows',
    links: [
      { href: '/admin/shows', label: 'Shows' },
      { href: '/admin/booking', label: 'Booking' },
      { href: '/admin/submissions', label: 'Submissions' },
      { href: '/admin/tv', label: 'TV Screen' },
    ],
  },
  {
    label: 'Bands',
    links: [{ href: '/admin/bands', label: 'Bands' }],
  },
  {
    label: 'Money',
    links: [
      { href: '/admin/settlements', label: 'Settlements' },
      { href: '/admin/expenses', label: 'Expenses' },
      { href: '/admin/year', label: 'Year in Review' },
    ],
  },
  {
    label: 'Crew',
    links: [
      { href: '/admin/crew', label: 'Crew' },
      { href: '/admin/sound-engineers', label: 'Sound Engineers' },
      { href: '/admin/photographers', label: 'Photographers' },
      { href: '/admin/door-persons', label: 'Door People' },
      { href: '/admin/timesheet', label: 'Timesheet' },
    ],
  },
  {
    label: 'Settings',
    links: [{ href: '/admin/settings', label: 'Settings' }],
  },
];

export function adminLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeAdminGroup(pathname: string) {
  return ADMIN_NAV.find((group) => group.links.some((link) => adminLinkActive(pathname, link.href)));
}

// Admin routes already on the 2027 paper shell. The layout gives these the
// sidebar and leaves every other /admin page on the old dark shell. Each
// redesign phase adds its routes here; the last phase deletes the list, the
// legacy shell and AdminNav.
const MIGRATED: RegExp[] = [
  /^\/admin$/, // the crew home (everyone else is redirected to /admin/shows)
  /^\/admin\/crew\/\d+\/preview$/, // the read-only preview of that home
  // Phase 2: the directories.
  /^\/admin\/(crew|sound-engineers|photographers|door-persons|bands)(\/.*)?$/,
  // Phase 3: booking and intake.
  /^\/admin\/(booking|submissions)(\/.*)?$/,
  // Phase 4a: the shows list, the TV screen and a show's TV tab.
  /^\/admin\/shows$/,
  /^\/admin\/tv$/,
  /^\/admin\/shows\/\d+\/tv$/,
  // Phase 4b: the show form (a show's Details tab, new show, new event).
  /^\/admin\/shows\/(\d+|new)$/,
  /^\/admin\/events\/new$/,
  // Phase 4c: a show's Contacts, Inputs and RSVPs tabs. (Portal renders the
  // band-facing /hub view, so it moves with /hub in Phase 7.)
  /^\/admin\/shows\/\d+\/(crew|inputs|rsvps)$/,
  // Phase 5: money — a show's Settlement tab, the Settlements summary,
  // Expenses, Year in Review and the Timesheet.
  /^\/admin\/shows\/\d+\/settlement$/,
  /^\/admin\/(settlements|expenses|year|timesheet)$/,
];

export function isMigratedAdminPath(pathname: string) {
  return MIGRATED.some((re) => re.test(pathname));
}
