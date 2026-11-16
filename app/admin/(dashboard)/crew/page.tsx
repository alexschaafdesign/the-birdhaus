import type { Metadata } from 'next';
import { listCrew } from '@/lib/accounts/members';
import { PageHeader } from '@/components/admin/ui';
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        overline="Crew"
        title="Crew"
        description="People with their own Birdhaus login. New invites get crew and staff (full admin); untick Staff to take admin away. Focus areas decide what their home dashboard highlights."
      />

      <CrewList initialCrew={crew} currentUserId={admin?.userId ?? null} />
    </main>
  );
}
