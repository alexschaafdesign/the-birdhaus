import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBandMember, getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getSong, songComments, songVersions, distinctTags } from '@/lib/band-songs';
import SongMetaEditor from '@/components/band/SongMetaEditor';
import BandVersionCard from '@/components/band/BandVersionCard';
import BandVersionUpload from '@/components/band/BandVersionUpload';
import BandSongComments from '@/components/band/BandSongComments';

export const metadata: Metadata = {
  title: 'Yellow Ostrich',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BandSongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await getBandMember();
  const admin = member ? false : await isAdminSession();
  if (!member && !admin) {
    if (await getClubMember()) redirect('/song-club');
    redirect('/song-club/login?next=/yellow-ostrich');
  }
  const viewerMemberId = member?.id ?? null;
  const canModerate = admin || Boolean(member?.roles.includes('staff'));

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [song, versions, comments, allTags] = await Promise.all([
    getSong(id),
    songVersions(id),
    songComments(id),
    distinctTags(),
  ]);
  if (!song) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link
        href="/yellow-ostrich"
        className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
      >
        ← All songs
      </Link>

      <div className="mt-4">
        <SongMetaEditor
          song={song}
          allTags={allTags}
          canDelete={canModerate || (viewerMemberId !== null && song.createdBy === viewerMemberId)}
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Versions
        </h2>
        {versions.length === 0 ? (
          <p className="mb-4 text-sm text-[#E8E0D0]/40">No recordings yet — upload the first one below.</p>
        ) : (
          <div className="mb-4 space-y-3">
            {versions.map((v) => (
              <BandVersionCard
                key={v.id}
                version={v}
                markers={comments.filter(
                  (c) => c.versionId === v.id && c.timestampSeconds !== null
                )}
                canEdit={canModerate || (viewerMemberId !== null && v.uploadedBy === viewerMemberId)}
              />
            ))}
          </div>
        )}
        <BandVersionUpload songId={song.id} versionCount={versions.length} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Notes &amp; comments
        </h2>
        <BandSongComments
          songId={song.id}
          comments={comments}
          versions={versions.map((v) => ({ id: v.id, label: v.label }))}
          viewerMemberId={viewerMemberId}
          canModerate={canModerate}
        />
      </section>
    </main>
  );
}
