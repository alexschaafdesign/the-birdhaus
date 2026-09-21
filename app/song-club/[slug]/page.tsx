import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getEventBySlug, getTodayCentral } from '@/lib/song-club';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import {
  getPlaylist,
  groupTrackCounts,
  highlightTracks,
  memberRoundTracks,
  playlistComments,
  playlistDayCounts,
  playlistTracks,
  playlistTracksByGroup,
  recentRoundTracks,
  groupUploadRoster,
} from '@/lib/club-music';
import { getPosts } from '@/lib/club-board';
import { getEventAttendees, isEventAttendee } from '@/lib/club-events';
import { getAttendeeGroupId, listGroups } from '@/lib/club-groups';
import SongClubRSVPForm from '@/components/SongClubRSVPForm';
import ClubTopBar from '@/components/club/ClubTopBar';
import PlaylistTracks from '@/components/club/PlaylistTracks';
import EventAttendees from '@/components/club/EventAttendees';
import ClubBoard from '@/components/club/ClubBoard';
import ParticipateButton from '@/components/club/ParticipateButton';
import CreateRoundForEvent from '@/components/club/CreateRoundForEvent';
import AutoJoin from '@/components/club/AutoJoin';
import RoundLockToggle from '@/components/club/RoundLockToggle';
import RecentRoundFeed from '@/components/club/RecentRoundFeed';
import GroupUploadDots from '@/components/club/GroupUploadDots';
import DayStrip from '@/components/club/DayStrip';

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

// Whole days from date a to date b (YYYY-MM-DD strings; positive when b is
// later). UTC-anchored so DST can't skew the count.
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
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
  searchParams: Promise<{ join?: string; day?: string }>;
}) {
  const event = await getEventBySlug((await params).slug);
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  // Members-only: logged-out visitors land on the public /song-club landing
  // (never a bare 401) — event links in emails/cards resolve there.
  if (!member && !admin) redirect('/song-club');
  if (!event || (!event.published && !admin)) notFound();

  // Post-auth auto-join: a member who arrived from "sign up to join" (?join=1)
  // and isn't yet enrolled gets signed up automatically (client-side).
  const sp = await searchParams;
  const wantsJoin = sp.join === '1';
  // Guests: sign up / log in, come back here, and auto-join.
  const signUpToJoinHref = `/song-club/signup?next=${encodeURIComponent(
    `/song-club/${event.slug}?join=1`
  )}`;

  const online = event.format === 'online';
  const today = getTodayCentral();
  // A multi-day event counts as upcoming/ongoing until its END date passes.
  const isUpcoming = (event.end_date ?? event.event_date) >= today;

  // Day counter — the page's sense of time. "Starts in N days" before the
  // event, "Day N of M" (with a progress bar for multi-day) while it runs,
  // nothing once it's wrapped (the date line already says when it was).
  const endDate = event.end_date ?? event.event_date;
  const totalDays = daysBetween(event.event_date, endDate) + 1;
  const isDuring = today >= event.event_date && today <= endDate;
  const dayOfEvent = isDuring ? daysBetween(event.event_date, today) + 1 : 0;
  const daysUntil = today < event.event_date ? daysBetween(today, event.event_date) : 0;

  // Day switcher (?day=N) — which day's roster/counters the overview shows.
  // Defaults to today; clamped into [1, today] so future days can't be peeked.
  const selectedDayNum = isDuring
    ? Math.min(Math.max(Number.parseInt(sp.day ?? '', 10) || dayOfEvent, 1), dayOfEvent)
    : dayOfEvent;
  const selectedDate = isDuring
    ? new Date(Date.parse(event.event_date + 'T00:00:00Z') + (selectedDayNum - 1) * 86400000)
        .toISOString()
        .slice(0, 10)
    : today;
  const isTodaySelected = selectedDate === today;
  const rosterWhenLabel = isTodaySelected
    ? 'today'
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
  const dayHref = (_d: string, n: number) =>
    n === dayOfEvent ? `/song-club/${event.slug}` : `/song-club/${event.slug}?day=${n}`;
  const dayLabel =
    daysUntil > 0
      ? daysUntil === 1
        ? 'Starts tomorrow'
        : `Starts in ${daysUntil} days`
      : isDuring
        ? totalDays > 1
          ? `Day ${dayOfEvent} of ${totalDays}`
          : 'Today'
        : null;
  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;

  const unlocked = admin || (member ? await isEventAttendee(event.id, member.id) : false);

  const [round, attendees, posts, groups] = unlocked
    ? await Promise.all([
        event.playlist_id ? getPlaylist(event.playlist_id) : Promise.resolve(null),
        getEventAttendees(event.id),
        getPosts(event.id),
        listGroups(event.id),
      ])
    : [null, [], [], []];

  // With groups, this page becomes the directory: your group pinned on top,
  // the others below, Highlights + any unassigned uploads inline, and the
  // event-wide board as announcements. No groups → exactly the old page.
  const hasGroups = groups.length > 0;
  const viewerGroupId =
    hasGroups && member ? await getAttendeeGroupId(event.id, member.id) : null;
  const viewerGroup = groups.find((g) => g.id === viewerGroupId) ?? null;

  const [roundTracks, roundComments] =
    round && !hasGroups
      ? await Promise.all([playlistTracks(round.id), playlistComments(round.id)])
      : [[], {}];
  const [highlights, unassignedTracks, groupModeComments, groupCounts, recentFeed, uploadRoster, myTracks] =
    round && hasGroups
      ? await Promise.all([
          highlightTracks(round.id),
          playlistTracksByGroup(round.id, event.id, null),
          playlistComments(round.id),
          groupTrackCounts(round.id, event.id, today),
          recentRoundTracks(round.id, event.id, 8),
          // The "who's in today" roster strip only makes sense while the
          // event runs — outside its days there is no "today" to fill.
          isDuring
            ? groupUploadRoster(round.id, event.id, selectedDate)
            : Promise.resolve(new Map<number, never[]>()),
          member ? memberRoundTracks(round.id, member.id) : Promise.resolve([]),
        ])
      : [
          [],
          [],
          {},
          new Map<number, { total: number; today: number }>(),
          { tracks: [], groupNames: {}, total: 0 },
          new Map<number, never[]>(),
          [],
        ];

  // The day-strip tracker: only while a multi-day event runs, for viewers
  // who can see the round. When it shows, it replaces the header's "Day N of
  // M" pill and thin progress bar.
  const dayCounts =
    unlocked && round && isDuring && totalDays > 1 ? await playlistDayCounts(round.id) : null;

  // "N songwriters · M songs · +k today" for the group directory cards.
  function groupStats(g: { id: number; memberCount: number }): {
    line: string;
    todayCount: number;
  } {
    const c = groupCounts.get(g.id);
    const people = `${g.memberCount} ${g.memberCount === 1 ? 'songwriter' : 'songwriters'}`;
    if (!c || c.total === 0) return { line: `${people} · no songs yet`, todayCount: 0 };
    return {
      line: `${people} · ${c.total} ${c.total === 1 ? 'song' : 'songs'}`,
      todayCount: c.today,
    };
  }

  // "About this event" — flyer, venue, description, body. One collapsible
  // block near the top: open before the event starts (when the how-it-works
  // matters most) and for guests (it's the pitch); collapsed once the event
  // is running so the live sections lead.
  const hasAbout = Boolean(
    event.flyer_url || event.description || event.body || (!online && event.venue_name)
  );
  const aboutOpen = !unlocked || today < event.event_date;
  const aboutSection = hasAbout ? (
    <details
      open={aboutOpen}
      className="group mt-6 rounded-xl border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 p-4 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45 transition hover:text-[#E8E0D0]/70 sm:px-5">
        About this event
        <span aria-hidden className="text-[#E8E0D0]/40 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {event.flyer_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.flyer_url}
            alt={event.title}
            className="w-full max-w-md rounded-lg border border-[#E8E0D0]/15"
          />
        )}
        {!online && event.venue_name && (
          <p className="mt-4 text-[15px] text-[#E8E0D0]/80">{event.venue_name}</p>
        )}
        {event.description && (
          <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#E8E0D0]/80">
            {event.description}
          </div>
        )}
        {event.body && (
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[#E8E0D0]/80">
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
      </div>
    </details>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <ClubTopBar />

      <header className="mt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          <span>
            {formatDateRange(event.event_date, event.end_date)}
            {timeLine ? ` · ${timeLine}` : ''}
            {online ? ' · Online' : ''}
            {!event.published && ' · Draft'}
          </span>
          {dayLabel && !dayCounts && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal ${
                isDuring
                  ? 'bg-[#c8a26a]/20 text-[#c8a26a]'
                  : 'bg-[#E8E0D0]/10 text-[#E8E0D0]/60'
              }`}
            >
              {dayLabel}
            </span>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
        {dayCounts ? (
          <DayStrip
            start={event.event_date}
            end={endDate}
            today={today}
            counts={dayCounts}
            selected={selectedDate}
            dayHref={dayHref}
          />
        ) : (
          isDuring &&
          totalDays > 1 && (
            <div className="mt-3 h-1 w-full max-w-xs overflow-hidden rounded-full bg-[#E8E0D0]/10">
              <div
                className="h-full rounded-full bg-[#c8a26a]"
                style={{ width: `${Math.round((dayOfEvent / totalDays) * 100)}%` }}
              />
            </div>
          )
        )}
      </header>

      {/* Admin controls — always available, no matter whether songs are
          enabled or any groups exist yet. Group management lives one click
          away; the song-uploads control sits with the songs below. */}
      {unlocked && admin && online && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link
            href={`/admin/song-club/${event.id}/rsvps`}
            className="text-xs text-[#E8E0D0]/50 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
          >
            Manage groups
          </Link>
        </div>
      )}

      {unlocked && aboutSection}

      {/* Group directory — when the event is split into groups. */}
      {unlocked && hasGroups && (
        <>
          {viewerGroup && (
            <section className="mt-6 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-[#c8a26a]/90">
                    Your group
                  </div>
                  <div className="mt-0.5 text-lg font-semibold">{viewerGroup.name}</div>
                  <div className="mt-0.5 text-xs text-[#E8E0D0]/50">
                    {groupStats(viewerGroup).line}
                    {!(uploadRoster.get(viewerGroup.id)?.length) &&
                      groupStats(viewerGroup).todayCount > 0 && (
                        <span className="ml-1.5 font-semibold text-[#c8a26a]">
                          +{groupStats(viewerGroup).todayCount} today
                        </span>
                      )}
                  </div>
                  <GroupUploadDots
                    roster={uploadRoster.get(viewerGroup.id) ?? []}
                    whenLabel={rosterWhenLabel}
                  />
                </div>
                <Link
                  href={`/song-club/${event.slug}/${viewerGroup.slug}`}
                  className="shrink-0 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
                >
                  Go to your group →
                </Link>
              </div>
            </section>
          )}

          {member && !viewerGroup && !admin && (
            <section className="mt-6 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
              <div className="text-sm text-[#E8E0D0]/80">
                You&apos;re in — you&apos;ll be placed in a group soon. You can start uploading
                now; your songs will land on your group&apos;s page once you&apos;re assigned.
              </div>
              {round && !round.locked && (
                <Link
                  href={`/song-club/upload?playlist=${round.id}`}
                  className="mt-3 inline-block rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
                >
                  + Upload your song
                </Link>
              )}
            </section>
          )}

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                {viewerGroup ? 'Pop over to the other groups' : 'Groups'}
              </h2>
              {admin && round && (
                <span className="flex items-center gap-3">
                  <RoundLockToggle playlistId={round.id} locked={round.locked} />
                </span>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {groups
                .filter((g) => g.id !== viewerGroup?.id)
                .map((g) => {
                  const stats = groupStats(g);
                  return (
                    <li key={g.id}>
                      <Link
                        href={`/song-club/${event.slug}/${g.slug}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{g.name}</span>
                          <span className="mt-0.5 block text-xs text-[#E8E0D0]/50">
                            {stats.line}
                            {!(uploadRoster.get(g.id)?.length) && stats.todayCount > 0 && (
                              <span className="ml-1.5 font-semibold text-[#c8a26a]">
                                +{stats.todayCount} today
                              </span>
                            )}
                          </span>
                          <GroupUploadDots
                            roster={uploadRoster.get(g.id) ?? []}
                            whenLabel={rosterWhenLabel}
                          />
                        </span>
                        <span aria-hidden className="shrink-0 text-[#E8E0D0]/40">
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>

          {/* The viewer's own reel — every song they've uploaded to this
              round, in day order, so replaying your whole run doesn't mean
              clicking into each day. Starts expanded — it's the viewer's own
              reference playlist; the toggle is there for tidying up. */}
          {round && myTracks.length > 0 && (
            <details
              open
              className="group mt-8 rounded-xl border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]"
            >
              <summary className="flex cursor-pointer select-none items-center justify-between gap-3 p-4 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45 transition hover:text-[#E8E0D0]/70 sm:px-5">
                <span>
                  Your songs so far
                  <span className="ml-2 rounded-full bg-[#c8a26a]/20 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-[#c8a26a]">
                    {myTracks.length} {myTracks.length === 1 ? 'song' : 'songs'}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-[#E8E0D0]/40 transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <PlaylistTracks
                  playlistId={round.id}
                  initialTracks={myTracks}
                  commentsByTrack={groupModeComments}
                  viewerMemberId={member?.id ?? null}
                  isAdmin={admin}
                  collapseByDay
                  eventStartDate={event.event_date}
                  allowReorder={false}
                />
              </div>
            </details>
          )}

          {/* Cross-group feed — every song as it comes in, newest first.
              Groups split the club; this stitches the listening back
              together without leaving the event page. */}
          {round && recentFeed.tracks.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                  Latest songs — all groups
                </h2>
                <Link
                  href={`/song-club/music/${round.id}`}
                  className="shrink-0 text-xs text-[#c8a26a]/80 underline-offset-2 transition hover:text-[#c8a26a] hover:underline"
                >
                  All {recentFeed.total} songs →
                </Link>
              </div>
              <RecentRoundFeed
                tracks={recentFeed.tracks}
                groupNames={recentFeed.groupNames}
                commentsByTrack={groupModeComments}
                viewerMemberId={member?.id ?? null}
                isAdmin={admin}
                eventStartDate={event.event_date}
              />
            </section>
          )}

          {round && (highlights.length > 0 || admin) && (
            <section className="mt-8 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#c8a26a]/90">
                ~Highlights~
              </h2>
              {highlights.length === 0 ? (
                <p className="text-sm text-[#E8E0D0]/50">
                  Nothing starred yet — hit ☆ on any track to feature it here.
                </p>
              ) : (
                // Flat and always visible — a curated shortlist, not a
                // day-by-day feed; collapsing belongs on group rounds.
                <PlaylistTracks
                  playlistId={round.id}
                  initialTracks={highlights}
                  commentsByTrack={groupModeComments}
                  viewerMemberId={member?.id ?? null}
                  isAdmin={admin}
                  allowReorder={false}
                />
              )}
            </section>
          )}

          {round && unassignedTracks.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                Unassigned — songs from folks not yet in a group
              </h2>
              {/* Flat and always visible — these need to be SEEN so people
                  get assigned; collapsing belongs on group rounds. */}
              <PlaylistTracks
                playlistId={round.id}
                initialTracks={unassignedTracks}
                commentsByTrack={groupModeComments}
                viewerMemberId={member?.id ?? null}
                isAdmin={admin}
                allowReorder={false}
              />
            </section>
          )}
        </>
      )}

      {/* The round — its own distinct, gold-accented card, above the flyer. */}
      {unlocked && round && !hasGroups && (
        <section className="mt-6 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#c8a26a]/90">
                Songs
                {round.locked && (
                  <span className="rounded bg-[#c8a26a]/20 px-1.5 py-0.5 text-[11px] normal-case tracking-normal">
                    🔒 Uploads closed
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
                  + Upload your song
                </Link>
              )}
            </div>
          </div>
          {round.locked && !admin && (
            <p className="mb-3 text-sm text-[#E8E0D0]/60">
              Uploads aren&apos;t open yet — check back soon.
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

      {/* Event chat — above the flyer. With groups it's the announcement
          channel that reaches everyone; day-to-day chatter moves to the
          group boards. */}
      {unlocked && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            {hasGroups ? 'Announcements — everyone' : 'Event chat'}
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
              Sign up to share your songs and hear everyone else&apos;s.
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
                Join to listen, share your song, and comment with everyone who
                took part.
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

      {!unlocked && aboutSection}

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
