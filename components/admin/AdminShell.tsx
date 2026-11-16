'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AdminNav from './AdminNav';
import { AdminBar } from './AdminBar';
import { AdminSidebar } from './AdminSidebar';
import { isMigratedAdminPath } from './nav';

// Picks the admin frame by route while pages move to the 2027 look one area
// at a time (see isMigratedAdminPath in ./nav):
//   migrated  paper + CommitMono, the AdminBar, then the left sidebar beside
//             the page (a Menu bar on top below lg)
//   legacy    the old dark shell: "Birdhaus Admin" and the two-row AdminNav
// The legacy branch and this switch go away in the last phase.
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isMigratedAdminPath(pathname)) {
    return (
      <div
        className="bg-surface-paper text-surface-ink font-commit-mono min-h-screen"
        // globals.css gives body the Courier hairline stroke; CommitMono
        // doesn't want it (same as SiteFrame).
        style={{ WebkitTextStroke: 0 }}
      >
        <AdminBar fullWidth />
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
          <AdminSidebar />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#171412] text-[#E8E0D0]">
      <AdminBar />
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <h1 className="text-2xl font-bold">Birdhaus Admin</h1>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}

export default AdminShell;
