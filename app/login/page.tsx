import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { listWorkspacesForUser } from '@/lib/workspaces';
import ClubLoginForm from '@/components/club/ClubLoginForm';

export const metadata: Metadata = {
  title: 'Log in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Neutral login — same accounts and form as the Song Club portal, without
// the club branding. Workspace invites land here so an outside songwriter
// isn't greeted by someone else's club.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const rawNext = (await searchParams).next;
  const next =
    rawNext && (rawNext.startsWith('/w/') || rawNext.startsWith('/song-club/'))
      ? rawNext
      : undefined;

  const member = await getClubMember();
  if (member) {
    if (next) redirect(next);
    const spaces = await listWorkspacesForUser(member.id);
    if (spaces[0]) redirect(`/w/${spaces[0].slug}`);
    redirect(member.roles.includes('song_club') ? '/song-club' : '/');
  }
  if (await isAdminSession()) redirect(next ?? '/admin');

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">Welcome back.</p>
      <div className="mt-6">
        <ClubLoginForm next={next} />
      </div>
    </main>
  );
}
