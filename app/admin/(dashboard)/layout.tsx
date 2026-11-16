import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { isAdminSession } from '@/lib/admin-session';

// The admin is moving to the 2027 paper look one area at a time: AdminShell
// gives migrated routes the paper frame and left sidebar, and the rest the old
// dark shell (see isMigratedAdminPath in components/admin/nav.ts).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already gates /admin on the cookie's HMAC, but only this check
  // hits the DB — a disabled staff account (or a stale session epoch) passes
  // the middleware's signature check and must be turned away here, before any
  // page under the dashboard renders data.
  if (!(await isAdminSession())) {
    redirect('/admin/login');
  }
  return <AdminShell>{children}</AdminShell>;
}
