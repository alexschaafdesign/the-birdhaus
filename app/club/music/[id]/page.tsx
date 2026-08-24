import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPlaylist, playlistComments, playlistTracks } from '@/lib/club-music';
import PlaylistTracks from '@/components/club/PlaylistTracks';
import DeletePlaylistButton from '@/components/club/DeletePlaylistButton';

export const metadata: Metadata = {
  title: 'Song Club — round',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// A round: its tracks in order, each with a player and its comment thread.
export default async function ClubPlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/club/login');

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const playlist = await getPlaylist(id);
  if (!playlist) notFound();

  const [tracks, comments] = await Promise.all([playlistTracks(id), playlistComments(id)]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link href="/club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club portal
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-[#c8a26a]/80">
              Round · {playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'}
            </div>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{playlist.title}</h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href={`/club/upload?playlist=${playlist.id}`}
              className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
            >
              + Upload to this round
            </Link>
            {admin && <DeletePlaylistButton playlistId={playlist.id} />}
          </div>
        </div>
        {playlist.description && (
          <p className="mt-3 whitespace-pre-wrap text-[15px] text-[#E8E0D0]/70">
            {playlist.description}
          </p>
        )}
      </header>

      <PlaylistTracks
        playlistId={playlist.id}
        initialTracks={tracks}
        commentsByTrack={comments}
        viewerMemberId={member?.id ?? null}
        isAdmin={admin}
      />
    </main>
  );
}
