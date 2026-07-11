import LogoutButton from '@/components/admin/LogoutButton';
import AdminNav from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
