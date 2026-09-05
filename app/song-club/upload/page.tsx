import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { listPlaylists } from '@/lib/club-music';
import UploadTrackForm from '@/components/club/UploadTrackForm';
import ClubTopBar from '@/components/club/ClubTopBar';

export const metadata: Metadata = {
  title: 'Song Club — upload a track',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ playlist?: string }>;
}) {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/song-club/login');

  // Members can only upload to open rounds; the admin can upload to any.
  const playlists = (await listPlaylists()).filter((p) => admin || !p.locked);
  const requested = Number((await searchParams).playlist);
  const defaultPlaylistId = playlists.some((p) => p.id === requested) ? requested : undefined;

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-8 text-[#E8E0D0] sm:py-10">
      <ClubTopBar />
      <h1 className="mt-3 text-2xl font-semibold">Upload a track</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        Goes straight to the club — only members can hear it.
      </p>
      <div className="mt-6">
        <UploadTrackForm
          playlists={playlists.map((p) => ({ id: p.id, title: p.title }))}
          defaultPlaylistId={defaultPlaylistId}
        />
      </div>
    </main>
  );
}
