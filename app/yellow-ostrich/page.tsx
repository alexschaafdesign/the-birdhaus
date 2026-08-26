import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getBandMember, getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { distinctTags, listSongs } from '@/lib/band-songs';
import BandSongList from '@/components/band/BandSongList';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export const metadata: Metadata = {
  title: 'Yellow Ostrich',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The band's private song pile: every in-progress song, tagged and statused,
// while the album takes shape. No guest mode — band members and staff only.
export default async function YellowOstrichPage() {
  const member = await getBandMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) {
    // A logged-in member without the band role goes back to their portal —
    // sending them to login would just bounce them here again.
    if (await getClubMember()) redirect('/song-club');
    redirect('/song-club/login?next=/yellow-ostrich');
  }

  const [songs, allTags] = await Promise.all([listSongs(), distinctTags()]);
  const contenders = songs.filter((s) => s.status === 'contender').length;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Yellow Ostrich</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">
            The song pile — {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            {contenders > 0 && `, ${contenders} contender${contenders === 1 ? '' : 's'}`}.
          </p>
        </div>
        <div className="shrink-0">
          {member && <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />}
        </div>
      </header>

      <BandSongList songs={songs} allTags={allTags} />
    </main>
  );
}
