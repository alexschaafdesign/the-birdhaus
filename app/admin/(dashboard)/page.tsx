import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import CrewHome from '@/components/admin/CrewHome';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const member = await getClubMember();
  // Crew members (logged in via their own account) land on a dashboard tailored
  // to their focus areas. Alex — who logs in with the shared password and has no
  // per-user session — and any non-crew staff go straight to shows as before.
  if (member?.roles.includes('crew')) {
    return <CrewHome member={member} />;
  }
  redirect('/admin/shows');
}
