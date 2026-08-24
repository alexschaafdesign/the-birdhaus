import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPins, getPosts } from '@/lib/club-board';
import { listPlaylists, standaloneTracks } from '@/lib/club-music';
import ClubPins from '@/components/club/ClubPins';
import ClubBoard from '@/components/club/ClubBoard';
import NewPlaylistForm from '@/components/club/NewPlaylistForm';

export const metadata: Metadata = {
  title: 'Song Club portal',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The members-only Song Club portal: pinned files/players up top, the group
// thread below. Visible to logged-in members and to the admin session (Alex
// posts as "the Birdhaus").
export default async function ClubPage() {
  const member = await getClubMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) redirect('/club/login');

  const [pins, posts, playlists, singles] = await Promise.all([
    getPins(),
    getPosts(),
    listPlaylists(),
    standaloneTracks(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
            Members only
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">Song Club portal</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-sm text-[#E8E0D0]/70">
            {member ? member.name : 'the Birdhaus (admin)'}
          </span>
          {member ? (
            <form action="/api/club/logout" method="post">
              <button
                type="submit"
                className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
              >
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/admin/song-club/members"
              className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Manage members
            </Link>
          )}
        </div>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
            Music
          </h2>
          <Link
            href="/club/upload"
            className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white"
          >
            + Upload a track
          </Link>
        </div>

        {playlists.length === 0 && singles.length === 0 && (
          <p className="text-sm text-[#E8E0D0]/40">
            Nothing here yet — upload the first track.
          </p>
        )}

        {playlists.length > 0 && (
          <div className="space-y-2">
            {playlists.map((p) => (
              <Link
                key={p.id}
                href={`/club/music/${p.id}`}
                className="block rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-[#E8E0D0]">{p.title}</span>
                  <span className="shrink-0 text-xs text-[#E8E0D0]/50">
                    {p.trackCount} track{p.trackCount === 1 ? '' : 's'}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-1 truncate text-sm text-[#E8E0D0]/55">{p.description}</p>
                )}
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
                    href={`/club/track/${t.id}`}
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

      <ClubPins
        initialPins={pins}
        viewerMemberId={member?.id ?? null}
        isAdmin={admin}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          The thread
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
