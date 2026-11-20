// The admin's sections, for the 2027 sidebar (AdminSidebar).

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
    label: 'Calendar',
    links: [{ href: '/admin/calendar', label: 'Calendar' }],
  },
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
    label: 'Rehearsal',
    links: [
      { href: '/admin/rehearsal/requests', label: 'Requests' },
      { href: '/admin/rehearsal/calendar', label: 'Calendar' },
      { href: '/admin/rehearsal/bands', label: 'Bands' },
      { href: '/admin/rehearsal/leads', label: 'Leads' },
      { href: '/admin/rehearsal/settings', label: 'Settings' },
    ],
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
