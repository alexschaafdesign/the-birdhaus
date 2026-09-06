import type { Metadata } from 'next';
import Link from 'next/link';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPins, getPosts } from '@/lib/club-board';
import { listPortalEvents } from '@/lib/club-events';
import ClubPins from '@/components/club/ClubPins';
import ClubBoard from '@/components/club/ClubBoard';
import SongClubLogo from '@/components/club/SongClubLogo';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export const metadata: Metadata = {
  title: 'Song Club',
  description: 'A Birdhaus songwriting community — events, rounds, and the group thread.',
};

export const dynamic = 'force-dynamic';

// The centralized Song Club page: events, music, pinned items, and the group
// chat — members and the admin session only. Logged-out visitors get the
// public landing below (the one Song Club URL that renders for guests, so
// every link into the club resolves somewhere friendly): what the club is,
// log in, and sign up. Login/signup/invite-accept stay public alongside it.
export default async function SongClubPage() {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  const canAct = Boolean(member) || admin;

  if (!canAct) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-16 text-center text-[#E8E0D0] sm:px-8">
        <SongClubLogo className="mx-auto h-20 w-20" />
        <h1 className="mt-5 text-3xl font-semibold">Song Club</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#E8E0D0]/70">
          A Birdhaus songwriting community — song-a-day rounds, monthly meetups,
          and a place to share works in progress. What&apos;s shared here stays
          between members.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/song-club/signup"
            className="rounded-md bg-[#E8E0D0] px-5 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
          >
            Sign up
          </Link>
          <Link
            href="/song-club/login"
            className="rounded-md border border-[#E8E0D0]/30 px-5 py-2.5 text-sm font-semibold transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const [pins, posts, events] = await Promise.all([
    getPins(),
    getPosts(),
    listPortalEvents(admin),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <SongClubLogo className="h-14 w-14 sm:h-16 sm:w-16" />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Song Club</h1>
            <p className="mt-1 text-sm text-[#E8E0D0]/60">
              {canAct
                ? 'Events, rounds, and the group thread.'
                : 'Take a look around — log in to post, upload, or join an event.'}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {member ? (
            <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />
          ) : admin ? (
            <Link
              href="/admin/song-club/members"
              className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Manage members
            </Link>
          ) : (
            <Link
              href="/song-club/signup"
              className="rounded-md border border-[#E8E0D0]/30 px-4 py-2 text-sm font-semibold text-[#E8E0D0] transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
            >
              Sign up/log in
            </Link>
          )}
        </div>
      </header>

      {/* Events — the club's primary organizer. Each links to its hub. */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Events
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/40">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/song-club/${e.slug}`}
                className="flex items-center gap-3 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
              >
                {e.flyerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.flyerUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-[#E8E0D0]">
                      {e.title}
                      {!e.published && (
                        <span className="ml-2 rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#E8E0D0]/60">
                          Draft
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-[#E8E0D0]/50">{formatShortRange(e.eventDate, e.endDate)}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#E8E0D0]/55">
                    {[
                      e.playlistId ? `${e.trackCount} track${e.trackCount === 1 ? '' : 's'}` : null,
                      e.attendeeCount
                        ? `${e.attendeeCount} musician${e.attendeeCount === 1 ? '' : 's'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Chat, upload your song, listen to others'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ClubPins initialPins={pins} viewerMemberId={member?.id ?? null} isAdmin={admin} />

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Song Club chat
        </h2>
        <ClubBoard
          initialPosts={posts}
          viewerMemberId={member?.id ?? null}
          isAdmin={admin}
        />
      </section>
    </main>
  );
}

// "2026-08-15" -> "Aug 15, 2026"; with an end date -> "Sep 16 – 25" etc.
function formatShortDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortRange(start: string, end: string | null): string {
  if (!end || end === start) return formatShortDate(start);
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${mon(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${mon(s)} ${s.getDate()}, ${s.getFullYear()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`;
}
