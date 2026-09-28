import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { getPhotographerByUserId } from '@/lib/photographers';
import CrewHome from '@/components/admin/CrewHome';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const member = await getClubMember();
  // Crew members land on a dashboard tailored to their focus areas — but only
  // when there's actually something tailored to show (an assigned focus area or
  // a linked photographer profile). Accounts with neither — the Birdhaus admin
  // (crew+staff, no focus areas) and any not-yet-configured crew — go straight
  // to shows, the way admin used to open.
  if (member?.roles.includes('crew')) {
    const hasTailoredContent =
      member.focus_areas.length > 0 || Boolean(await getPhotographerByUserId(member.id));
    if (hasTailoredContent) {
      return <CrewHome member={member} />;
    }
  }
  redirect('/admin/shows');
}
