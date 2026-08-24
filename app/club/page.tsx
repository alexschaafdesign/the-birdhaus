import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPins, getPosts } from '@/lib/club-board';
import ClubPins from '@/components/club/ClubPins';
import ClubBoard from '@/components/club/ClubBoard';

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

  const [pins, posts] = await Promise.all([getPins(), getPosts()]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
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
