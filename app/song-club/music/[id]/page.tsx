import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPlaylist, getRoundEvent, playlistComments, playlistTracks } from '@/lib/club-music';
import { isEventAttendee } from '@/lib/club-events';
import PlaylistTracks from '@/components/club/PlaylistTracks';
import DeletePlaylistButton from '@/components/club/DeletePlaylistButton';
import RoundCover from '@/components/club/RoundCover';
import ClubTopBar from '@/components/club/ClubTopBar';
import RoundLockToggle from '@/components/club/RoundLockToggle';

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
  // Members-only: logged-out visitors land on the public /song-club landing.
  if (!member && !admin) redirect('/song-club');

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const playlist = await getPlaylist(id);
  if (!playlist) notFound();

  const roundEvent = await getRoundEvent(id);
  // A round tied to an event inherits that event's participation gate: anyone
  // who isn't the admin or a marked participant (a member who hasn't joined,
  // or a logged-out guest) is sent to the event to unlock it.
  if (
    roundEvent &&
    !admin &&
    !(member && (await isEventAttendee(roundEvent.id, member.id)))
  ) {
    redirect(`/song-club/${roundEvent.slug}`);
  }

  const [tracks, comments] = await Promise.all([playlistTracks(id), playlistComments(id)]);
  // Event-linked rounds take their cover from the event flyer; standalone
  // rounds fall back to their own uploaded image.
  const coverUrl = roundEvent?.flyerUrl ?? playlist.imageUrl;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <ClubTopBar />
      <Link
        href={roundEvent ? `/song-club/${roundEvent.slug}` : '/song-club'}
        className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
      >
        ← {roundEvent ? roundEvent.title : 'Song Club'}
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#c8a26a]/80">
              Round · {playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'}
              {playlist.locked && (
                <span className="rounded bg-[#c8a26a]/20 px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                  🔒 Locked
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{playlist.title}</h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {(!playlist.locked || admin) && (
              <Link
                href={`/song-club/upload?playlist=${playlist.id}`}
                className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
              >
                + Upload to this round
              </Link>
            )}
            {admin && <RoundLockToggle playlistId={playlist.id} locked={playlist.locked} />}
            {admin && <DeletePlaylistButton playlistId={playlist.id} />}
          </div>
        </div>
        {playlist.description && (
          <p className="mt-3 whitespace-pre-wrap text-[15px] text-[#E8E0D0]/70">
            {playlist.description}
          </p>
        )}
      </header>

      {roundEvent ? (
        // Cover comes from the event; no per-round upload control here.
        coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="mb-4 w-full max-w-sm rounded-lg border border-[#E8E0D0]/15 object-cover"
          />
        )
      ) : (
        <RoundCover playlistId={playlist.id} imageUrl={playlist.imageUrl} isAdmin={admin} />
      )}

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
