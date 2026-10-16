import type { Metadata } from 'next';
import { listCrew } from '@/lib/accounts/members';
import CrewList from '@/components/admin/CrewList';
import { getAdminSession } from '@/lib/admin-session';

export const metadata: Metadata = {
  title: 'Crew',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminCrewPage() {
  const [crew, admin] = await Promise.all([listCrew(), getAdminSession()]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 text-[#E8E0D0]">
      <div className="mb-6">
        <h2 className="text-xl font-medium">Crew</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/55">
          People with their own Birdhaus login. New invites get crew and staff (full
          admin); untick Staff to take admin away. Focus areas decide what their home
          dashboard highlights.
        </p>
      </div>

      <CrewList initialCrew={crew} currentUserId={admin?.userId ?? null} />
    </main>
  );
}
