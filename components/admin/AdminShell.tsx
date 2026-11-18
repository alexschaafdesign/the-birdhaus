'use client';

import type { ReactNode } from 'react';
import { AdminBar } from './AdminBar';
import { AdminSidebar } from './AdminSidebar';

// The admin frame: paper + CommitMono, the AdminBar, then the left sidebar
// beside the page (a Menu bar on top below lg).
export function AdminShell({ children }: { children: ReactNode }) {
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
        <div className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AdminShell;
