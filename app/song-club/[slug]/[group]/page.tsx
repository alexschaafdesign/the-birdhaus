import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getEventBySlug, getTodayCentral } from '@/lib/song-club';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPlaylist, groupDayCounts, playlistComments, playlistTracksByGroup } from '@/lib/club-music';
import { getPosts } from '@/lib/club-board';
import { isEventAttendee } from '@/lib/club-events';
import { getAttendeeGroupId, getGroupBySlug, listGroupRoster, listGroups } from '@/lib/club-groups';
import ClubTopBar from '@/components/club/ClubTopBar';
import PlaylistTracks from '@/components/club/PlaylistTracks';
import ClubBoard from '@/components/club/ClubBoard';
import DayStrip from '@/components/club/DayStrip';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; group: string }>;
}): Promise<Metadata> {
  const { slug, group: groupSlug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || !event.published) return { title: 'Song Club' };
  const group = await getGroupBySlug(event.id, groupSlug);
  return {
    title: group ? `${group.name} — ${event.title} — Song Club` : `${event.title} — Song Club`,
    robots: { index: false, follow: false },
  };
}

// One page per group of a song-a-day event: the group's day-by-day song list
// (derived from its members' uploads into the event round), its own board,
// and its roster. Any attendee of the event can visit any group to listen and
// comment; uploading and posting stay with the group's own members.
export default async function SongClubGroupPage({
  params,
}: {
  params: Promise<{ slug: string; group: string }>;
}) {
  const { slug, group: groupSlug } = await params;
  const event = await getEventBySlug(slug);
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/song-club');
  if (!event || (!event.published && !admin)) notFound();

  // Group pages are for people who are IN the event — everyone else lands on
  // the event page, which has the join actions.
  const unlocked = admin || (member ? await isEventAttendee(event.id, member.id) : false);
  if (!unlocked) redirect(`/song-club/${event.slug}`);

  const group = await getGroupBySlug(event.id, groupSlug);
  if (!group) notFound();

  const round = event.playlist_id ? await getPlaylist(event.playlist_id) : null;
  const viewerGroupId = member ? await getAttendeeGroupId(event.id, member.id) : null;
  const inThisGroup = viewerGroupId === group.id;

  // Day strip, scoped to THIS group's songs — only while a multi-day event
  // runs (mirrors the event page's tracker).
  const today = getTodayCentral();
  const endDate = event.end_date ?? event.event_date;
  const stripLive = endDate !== event.event_date && today >= event.event_date && today <= endDate;

  const [tracks, comments, posts, roster, groups, dayCounts] = await Promise.all([
    round ? playlistTracksByGroup(round.id, event.id, group.id) : Promise.resolve([]),
    round ? playlistComments(round.id) : Promise.resolve({}),
    getPosts(event.id, group.id),
    listGroupRoster(event.id),
    listGroups(event.id),
    round && stripLive
      ? groupDayCounts(round.id, event.id, group.id)
      : Promise.resolve(null),
  ]);
  const groupRoster = roster.filter((r) => r.groupId === group.id);
  const otherGroups = groups.filter((g) => g.id !== group.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <ClubTopBar />

      <header className="mt-2">
        <Link
          href={`/song-club/${event.slug}`}
          className="text-xs text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          ← {event.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{group.name}</h1>
        <div className="mt-1 text-xs text-[#E8E0D0]/50">
          {groupRoster.length} {groupRoster.length === 1 ? 'songwriter' : 'songwriters'}
          {inThisGroup && ' · your group'}
        </div>
        {dayCounts && (
          <DayStrip
            start={event.event_date}
            end={endDate}
            today={today}
            counts={dayCounts}
          />
        )}
      </header>

      {/* The group's songs, day by day. */}
      <section className="mt-6 rounded-xl border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-[#c8a26a]/90">
            Songs
          </div>
          {round && (admin || (inThisGroup && !round.locked)) && (
            <Link
              href={`/song-club/upload?playlist=${round.id}`}
              className="shrink-0 rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
            >
              + Upload your song
            </Link>
          )}
        </div>
        {!round ? (
          <p className="text-sm text-[#E8E0D0]/50">No songs yet.</p>
        ) : tracks.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">
            No songs from {group.name} yet
            {inThisGroup ? ' — yours could be the first.' : '.'}
          </p>
        ) : (
          <PlaylistTracks
            playlistId={round.id}
            initialTracks={tracks}
            commentsByTrack={comments}
            viewerMemberId={member?.id ?? null}
            isAdmin={admin}
            collapseByDay
            eventStartDate={event.event_date}
            eventEndDate={event.end_date}
            today={today}
            daysOpenDefault={event.days_open_default}
            storageKey={`${event.id}:${group.id}`}
          />
        )}
      </section>

      {/* The group's board — readable by any attendee, writable by its members. */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          {group.name} chat
        </h2>
        <ClubBoard
          initialPosts={posts}
          viewerMemberId={member?.id ?? null}
          isAdmin={admin}
          eventId={event.id}
          groupId={group.id}
          canPost={inThisGroup}
          readOnlyNote={`You're visiting — only ${group.name} posts here, but you can comment on any song above.`}
        />
      </section>

      {/* Who's in this group. */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Songwriters
        </h2>
        {groupRoster.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/40">Nobody has been assigned yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {groupRoster.map((r) => (
              <li
                key={r.userId}
                className="flex items-center gap-2 rounded-full border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] py-1 pl-1 pr-3 text-sm"
              >
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E8E0D0]/10 text-[11px] text-[#E8E0D0]/60">
                    {r.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pop over to the others. */}
      {otherGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            Pop over to the other groups
          </h2>
          <ul className="flex flex-wrap gap-2">
            {otherGroups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/song-club/${event.slug}/${g.slug}`}
                  className="inline-block rounded-full border border-[#E8E0D0]/20 px-3.5 py-1.5 text-sm text-[#E8E0D0]/75 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                >
                  {g.name} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
