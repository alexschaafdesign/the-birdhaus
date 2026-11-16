// The admin's sections, shared by the 2027 sidebar (AdminSidebar) and the old
// dark two-row nav (AdminNav, kept only for the rehearsal admin; see
// isDarkAdminPath below).

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

// Admin routes still on the old dark shell. Everything else under /admin is on
// the 2027 paper frame. Only the rehearsal admin is left: it lives on the
// rehearsal branch and moves to paper once that branch reaches main; then this
// list, the dark branch in AdminShell and AdminNav all go.
const STILL_DARK: RegExp[] = [/^\/admin\/rehearsal(\/.*)?$/];

export function isDarkAdminPath(pathname: string) {
  return STILL_DARK.some((re) => re.test(pathname));
}
