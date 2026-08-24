import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { listPlaylists } from '@/lib/club-music';
import UploadTrackForm from '@/components/club/UploadTrackForm';

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
  if (!member && !admin) redirect('/club/login');

  const playlists = await listPlaylists();
  const requested = Number((await searchParams).playlist);
  const defaultPlaylistId = playlists.some((p) => p.id === requested) ? requested : undefined;

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-8 text-[#E8E0D0] sm:py-10">
      <Link href="/club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club portal
      </Link>
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
