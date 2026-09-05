import { redirect } from 'next/navigation';
import LogoutButton from '@/components/admin/LogoutButton';
import AdminNav from '@/components/admin/AdminNav';
import { isAdminSession } from '@/lib/admin-session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already gates /admin on the cookie's HMAC, but only this check
  // hits the DB — a disabled staff account (or a stale session epoch) passes
  // the middleware's signature check and must be turned away here, before any
  // page under the dashboard renders data.
  if (!(await isAdminSession())) {
    redirect('/admin/login');
  }
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Birdhaus Admin</h1>
          <LogoutButton />
        </div>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
