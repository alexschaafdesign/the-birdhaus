import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getTrack, trackComments } from '@/lib/club-music';
import SingleTrackView from '@/components/club/SingleTrackView';

export const metadata: Metadata = {
  title: 'Song Club — track',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubTrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/club/login');

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const track = await getTrack(id);
  if (!track) notFound();

  const comments = await trackComments(id);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link href="/club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club portal
      </Link>
      <div className="mt-4">
        <SingleTrackView
          track={track}
          initialComments={comments}
          viewerMemberId={member?.id ?? null}
          isAdmin={admin}
        />
      </div>
    </main>
  );
}
