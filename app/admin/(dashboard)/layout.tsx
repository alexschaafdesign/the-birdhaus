import LogoutButton from '@/components/admin/LogoutButton';
import AdminNav from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // The admin dashboard still uses the old dark shell while the public site
  // moves to the 2027 light look, so it sets its own background.
  return (
    <div className="min-h-screen bg-[#171412] text-[#E8E0D0]">
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
