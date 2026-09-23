import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBandMember, getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { distinctTags, listSongs } from '@/lib/band-songs';
import BandBulkImport from '@/components/band/BandBulkImport';

export const metadata: Metadata = {
  title: 'Import — Yellow Ostrich',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Bulk import: a folder of bounces in, one song per file out. Same gate as
// the song pile — band members and staff only.
export default async function YellowOstrichImportPage() {
  const member = await getBandMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) {
    if (await getClubMember()) redirect('/song-club');
    redirect('/song-club/login?next=/yellow-ostrich/import');
  }

  // Existing titles feed the "already a song with this title" nudge; tags
  // feed the batch tag picker.
  const [songs, allTags] = await Promise.all([listSongs(), distinctTags()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8">
        <Link
          href="/yellow-ostrich"
          className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          ← Yellow Ostrich
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Import demos</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Drop a folder of audio files — each one becomes a song with the file
          attached as its first version.
        </p>
      </header>

      <BandBulkImport allTags={allTags} existingTitles={songs.map((s) => s.title)} />
    </main>
  );
}
