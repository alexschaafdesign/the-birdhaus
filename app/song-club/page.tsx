import type { Metadata } from 'next';
import Link from 'next/link';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPins, getPosts } from '@/lib/club-board';
import { listStandaloneRounds, standaloneTracks } from '@/lib/club-music';
import { listPortalEvents } from '@/lib/club-events';
import ClubPins from '@/components/club/ClubPins';
import ClubBoard from '@/components/club/ClubBoard';
import NewPlaylistForm from '@/components/club/NewPlaylistForm';
import SongClubLogo from '@/components/club/SongClubLogo';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export const metadata: Metadata = {
  title: 'Song Club',
  description: 'A Birdhaus songwriting community — events, rounds, and the group thread.',
};

export const dynamic = 'force-dynamic';

// The centralized Song Club page: events, music, pinned items, and the group
// chat. Anyone can glimpse it read-only; taking any action prompts a login.
// Members and the admin session see the full portal with composers/uploads.
export default async function SongClubPage() {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();
  const canAct = Boolean(member) || admin;

  const [pins, posts, events, rounds, singles] = await Promise.all([
    getPins(),
    getPosts(),
    listPortalEvents(admin),
    listStandaloneRounds(),
    standaloneTracks(),
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
              href="/song-club/login"
              className="rounded-md border border-[#E8E0D0]/30 px-4 py-2 text-sm font-semibold text-[#E8E0D0] transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
            >
              Log in
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
                      e.attendeeCount ? `${e.attendeeCount} came` : null,
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

      {/* Music — standalone rounds + singles not tied to any event. */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            Music
          </h2>
          {canAct ? (
            <Link
              href="/song-club/upload"
              className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
            >
              + Upload a track
            </Link>
          ) : (
            <Link
              href="/song-club/login"
              className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Log in to upload
            </Link>
          )}
        </div>

        {rounds.length === 0 && singles.length === 0 && (
          <p className="text-sm text-[#E8E0D0]/40">Nothing here yet.</p>
        )}

        {rounds.length > 0 && (
          <div className="space-y-2">
            {rounds.map((p) => (
              <Link
                key={p.id}
                href={`/song-club/music/${p.id}`}
                className="flex items-center gap-3 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
              >
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-[#E8E0D0]">{p.title}</span>
                    <span className="shrink-0 text-xs text-[#E8E0D0]/50">
                      {p.trackCount} track{p.trackCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-1 truncate text-sm text-[#E8E0D0]/55">{p.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {singles.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#E8E0D0]/35">
              Singles
            </h3>
            <ul className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]">
              {singles.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/song-club/track/${t.id}`}
                    className="flex items-baseline justify-between gap-3 px-4 py-2.5 transition hover:bg-[#E8E0D0]/[0.05]"
                  >
                    <span className="min-w-0 truncate text-sm text-[#E8E0D0]">{t.title}</span>
                    <span className="shrink-0 text-xs text-[#E8E0D0]/45">
                      {t.uploaderName}
                      {t.commentCount > 0 ? ` · ${t.commentCount} 💬` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {admin && (
          <div className="mt-3">
            <NewPlaylistForm />
          </div>
        )}
      </section>

      <ClubPins initialPins={pins} viewerMemberId={member?.id ?? null} isAdmin={admin} />

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          General chat
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
