import LogoutButton from '@/components/admin/LogoutButton';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Show submissions</h1>
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}
