import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getEventById } from '@/lib/song-club';
import { getPlaylist, playlistComments, playlistTracks } from '@/lib/club-music';
import { getPosts } from '@/lib/club-board';
import { getAddableMembers, getEventAttendees, isEventAttendee } from '@/lib/club-events';
import EventAttendees from '@/components/club/EventAttendees';
import ClubBoard from '@/components/club/ClubBoard';
import ParticipateButton from '@/components/club/ParticipateButton';
import CreateRoundForEvent from '@/components/club/CreateRoundForEvent';
import PlaylistTracks from '@/components/club/PlaylistTracks';

export const metadata: Metadata = {
  title: 'Song Club — event',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// The portal event hub: flyer + details, a link to the event's round, the
// attendee roster (admin-curated profile cards), and the event's own board.
export default async function ClubEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/club/login');

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const event = await getEventById(id);
  // Members only see published events; admin sees drafts too.
  if (!event || (!event.published && !admin)) notFound();

  // Event content (round, attendees, chat) is gated: the admin sees everything;
  // a member must have marked participation. Anyone signed-up sees the flyer +
  // description teaser and the unlock button.
  const unlocked = admin || (member ? await isEventAttendee(id, member.id) : false);

  const [round, attendees, addable, posts] = unlocked
    ? await Promise.all([
        event.playlist_id ? getPlaylist(event.playlist_id) : Promise.resolve(null),
        getEventAttendees(id),
        admin ? getAddableMembers(id) : Promise.resolve([]),
        getPosts(id),
      ])
    : [null, [], [], []];

  // The round's tracks render inline on the event page (players + comments),
  // so there's no separate "listen" page to click through to.
  const [roundTracks, roundComments] = round
    ? await Promise.all([playlistTracks(round.id), playlistComments(round.id)])
    : [[], {}];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link href="/club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club portal
      </Link>

      <header className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          {formatDate(event.event_date)}
          {!event.published && ' · Draft'}
        </div>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
      </header>

      {/* The round leads — its tracks play inline here, above the flyer. */}
      {unlocked && round && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-[#c8a26a]/80">
                The round
              </div>
              <div className="truncate font-medium text-[#E8E0D0]">{round.title}</div>
            </div>
            <Link
              href={`/club/upload?playlist=${round.id}`}
              className="shrink-0 rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
            >
              + Upload your track
            </Link>
          </div>
          <PlaylistTracks
            playlistId={round.id}
            initialTracks={roundTracks}
            commentsByTrack={roundComments}
            viewerMemberId={member?.id ?? null}
            isAdmin={admin}
          />
        </section>
      )}

      {unlocked && !round && admin && (
        <CreateRoundForEvent eventId={id} defaultTitle={event.title} />
      )}

      {event.flyer_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.flyer_url}
          alt={event.title}
          className="mt-6 w-full max-w-md rounded-lg border border-[#E8E0D0]/15"
        />
      )}

      {event.description && (
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#E8E0D0]/80">
          {event.description}
        </div>
      )}

      {!unlocked ? (
        <section className="mt-6 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.06] p-5">
          <h2 className="text-lg font-medium">Were you part of this?</h2>
          <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
            Unlock the round and the conversation to listen, share your track, and
            comment with everyone who took part.
          </p>
          <ParticipateButton eventId={id} />
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
              Who came
            </h2>
            <EventAttendees
              eventId={id}
              initialAttendees={attendees}
              addableMembers={addable}
              isAdmin={admin}
            />
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
              Event chat
            </h2>
            <ClubBoard
              initialPosts={posts}
              viewerMemberId={member?.id ?? null}
              isAdmin={admin}
              eventId={id}
            />
          </section>
        </>
      )}
    </main>
  );
}
