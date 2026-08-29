import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getEventBySlug, getTodayCentral } from '@/lib/song-club';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPlaylist, playlistComments, playlistTracks } from '@/lib/club-music';
import { getPosts } from '@/lib/club-board';
import { getEventAttendees, isEventAttendee } from '@/lib/club-events';
import SongClubRSVPForm from '@/components/SongClubRSVPForm';
import ClubTopBar from '@/components/club/ClubTopBar';
import PlaylistTracks from '@/components/club/PlaylistTracks';
import EventAttendees from '@/components/club/EventAttendees';
import ClubBoard from '@/components/club/ClubBoard';
import ParticipateButton from '@/components/club/ParticipateButton';
import CreateRoundForEvent from '@/components/club/CreateRoundForEvent';
import AutoJoin from '@/components/club/AutoJoin';
import RoundLockToggle from '@/components/club/RoundLockToggle';

export const dynamic = 'force-dynamic';

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Sep 16 – 25, 2026" / "Sep 16 – Oct 2, 2026" for multi-day events; the full
// weekday form for single-day.
function formatDateRange(start: string, end: string | null): string {
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${mon(s)} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${mon(s)} ${s.getDate()}, ${s.getFullYear()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event || !event.published) return { title: 'Song Club' };
  return {
    title: `${event.title} — Song Club`,
    description: event.description?.slice(0, 200) ?? 'A Birdhaus Song Club event.',
    openGraph: event.flyer_url ? { images: [event.flyer_url] } : undefined,
  };
}

// One page per Song Club event: details + the right join action (RSVP for
// in-person, "Sign me up" for online), and — once you're in — the round
// (played inline) + who came + the event chat. Guests glimpse it read-only.
export default async function SongClubEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const event = await getEventBySlug((await params).slug);
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  // Drafts are admin-only; everything else is publicly glimpsable.
  if (!event || (!event.published && !admin)) notFound();

  // Post-auth auto-join: a member who arrived from "sign up to join" (?join=1)
  // and isn't yet enrolled gets signed up automatically (client-side).
  const wantsJoin = (await searchParams).join === '1';
  // Guests: sign up / log in, come back here, and auto-join.
  const signUpToJoinHref = `/song-club/signup?next=${encodeURIComponent(
    `/song-club/${event.slug}?join=1`
  )}`;

  const online = event.format === 'online';
  // A multi-day event counts as upcoming/ongoing until its END date passes.
  const isUpcoming = (event.end_date ?? event.event_date) >= getTodayCentral();
  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;

  const unlocked = admin || (member ? await isEventAttendee(event.id, member.id) : false);

  const [round, attendees, posts] = unlocked
    ? await Promise.all([
        event.playlist_id ? getPlaylist(event.playlist_id) : Promise.resolve(null),
        getEventAttendees(event.id),
        getPosts(event.id),
      ])
    : [null, [], []];
  const [roundTracks, roundComments] = round
    ? await Promise.all([playlistTracks(round.id), playlistComments(round.id)])
    : [[], {}];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <ClubTopBar />

      <header className="mt-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          {formatDateRange(event.event_date, event.end_date)}
          {timeLine ? ` · ${timeLine}` : ''}
          {online ? ' · Online' : ''}
          {!event.published && ' · Draft'}
        </div>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
      </header>

      {/* The round — its own distinct, gold-accented card, above the flyer. */}
      {unlocked && round && (
        <section className="mt-6 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#c8a26a]/90">
                The round
                {round.locked && (
                  <span className="rounded bg-[#c8a26a]/20 px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                    🔒 Locked
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-lg font-semibold text-[#E8E0D0]">
                {round.title}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {admin && <RoundLockToggle playlistId={round.id} locked={round.locked} />}
              {(!round.locked || admin) && (
                <Link
                  href={`/song-club/upload?playlist=${round.id}`}
                  className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
                >
                  + Upload your track
                </Link>
              )}
            </div>
          </div>
          {round.locked && !admin && (
            <p className="mb-3 text-sm text-[#E8E0D0]/60">
              Uploads open when the round starts — you&apos;ll be able to add your track then.
            </p>
          )}
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
        <CreateRoundForEvent eventId={event.id} defaultTitle={event.title} />
      )}

      {/* Event chat — above the flyer. */}
      {unlocked && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            Event chat
          </h2>
          <ClubBoard
            initialPosts={posts}
            viewerMemberId={member?.id ?? null}
            isAdmin={admin}
            eventId={event.id}
          />
        </section>
      )}

      {/* Join actions (only when not already in) — above the flyer. */}
      {!unlocked &&
        (member && wantsJoin ? (
          // Returned from login/signup with intent to join — enroll automatically.
          <AutoJoin eventId={Number(event.id)} slug={event.slug} />
        ) : online ? (
          <section className="mt-8 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.06] p-5">
            <h2 className="text-lg font-medium">Join this Song-a-day</h2>
            <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
              Sign up to share your tracks and hear everyone else&apos;s.
            </p>
            {member ? (
              <ParticipateButton eventId={event.id} label="Sign me up" />
            ) : (
              <Link
                href={signUpToJoinHref}
                className="inline-block rounded-md bg-[#E8E0D0] px-5 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
              >
                Sign up to join
              </Link>
            )}
          </section>
        ) : (
          <>
            {isUpcoming && event.published && (
              <section className="mt-8 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-5">
                <h2 className="text-lg font-medium">RSVP for this meetup</h2>
                <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
                  RSVP to get the address and full details emailed to you.
                </p>
                <SongClubRSVPForm eventId={event.id} />
              </section>
            )}
            <section className="mt-6 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.06] p-5">
              <h2 className="text-lg font-medium">Were you part of this?</h2>
              <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
                Unlock the round and the conversation to listen, share your track,
                and comment with everyone who took part.
              </p>
              {member ? (
                <ParticipateButton eventId={event.id} />
              ) : (
                <Link
                  href={signUpToJoinHref}
                  className="inline-block rounded-md bg-[#E8E0D0] px-5 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
                >
                  Sign up to join
                </Link>
              )}
            </section>
          </>
        ))}

      {event.flyer_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.flyer_url}
          alt={event.title}
          className="mt-6 w-full max-w-md rounded-lg border border-[#E8E0D0]/15"
        />
      )}

      {!online && event.venue_name && (
        <p className="mt-5 text-[15px] text-[#E8E0D0]/80">{event.venue_name}</p>
      )}

      {event.description && (
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#E8E0D0]/80">
          {event.description}
        </div>
      )}

      {event.body && (
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[#E8E0D0]/80">
          {event.body
            .split(/\n{2,}/)
            .map((para) => para.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {para}
              </p>
            ))}
        </div>
      )}

      {unlocked && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            Songwriters
          </h2>
          <EventAttendees
            eventId={event.id}
            initialAttendees={attendees}
            isAdmin={admin}
          />
        </section>
      )}
    </main>
  );
}
