import { redirect } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import { AdminBar } from '@/components/admin/AdminBar';
import { isAdminSession } from '@/lib/admin-session';

// The admin dashboard keeps its dark shell for launch (the public site is on
// the 2027 frame); only the slim AdminBar on top is 2027.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already gates /admin on the cookie's HMAC, but only this check
  // hits the DB — a disabled staff account (or a stale session epoch) passes
  // the middleware's signature check and must be turned away here, before any
  // page under the dashboard renders data.
  if (!(await isAdminSession())) {
    redirect('/admin/login');
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
