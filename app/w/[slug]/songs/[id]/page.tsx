import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWorkspaceBySlug, requireWorkspacePage } from '@/lib/workspaces';
import { getSong, songComments, songVersions, distinctTags } from '@/lib/band-songs';
import { listLyricsRevisions } from '@/lib/band-lyrics';
import { getColorLabels } from '@/lib/song-colors';
import BandLyrics from '@/components/band/BandLyrics';
import SongMetaEditor from '@/components/band/SongMetaEditor';
import BandVersionCard from '@/components/band/BandVersionCard';
import BandVersionUpload from '@/components/band/BandVersionUpload';
import BandSongComments from '@/components/band/BandSongComments';
import { bandVersionToPlayerTrack } from '@/lib/player-tracks';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const workspace = await getWorkspaceBySlug((await params).slug);
  return { title: workspace?.name ?? 'Workspace', robots: { index: false, follow: false } };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceSongPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const { workspace, actor, member } = await requireWorkspacePage(
    slug,
    `/w/${slug}/songs/${rawId}`
  );

  const viewerMemberId = member?.id ?? null;
  const canModerate = 'admin' in actor || actor.staff || actor.owner === true;

  const [song, versions, comments, allTags, lyricsRevisions, colorLabels] = await Promise.all([
    getSong(id),
    songVersions(id),
    songComments(id),
    distinctTags(workspace.id),
    listLyricsRevisions(id),
    getColorLabels(workspace.id),
  ]);
  // A song from another workspace 404s — same as not existing at all.
  if (!song || song.workspaceId !== workspace.id) notFound();
  // For the per-version "lyrics as recorded" panel + re-pin picker.
  const revisionRefs = lyricsRevisions.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    body: r.body,
  }));
  // The song's versions as a play queue for the global player.
  const songHref = `/w/${workspace.slug}/songs/${song.id}`;
  const playQueue = versions
    .filter((v) => v.url)
    .map((v) => bandVersionToPlayerTrack(v, song.title, songHref));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link
        href={`/w/${workspace.slug}?song=${song.id}`}
        className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
      >
        ← Back to the desk
      </Link>

      <div className="mt-4">
        <SongMetaEditor
          song={song}
          allTags={allTags}
          canDelete={canModerate || (viewerMemberId !== null && song.createdBy === viewerMemberId)}
          basePath={`/w/${workspace.slug}`}
          colorLabels={colorLabels}
        />
      </div>

      <section className="mt-8">
        <BandLyrics
          songId={song.id}
          revisions={lyricsRevisions}
          deskHref={`/w/${workspace.slug}?song=${song.id}`}
        />
      </section>

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
                lyricsRevisions={revisionRefs}
                songTitle={song.title}
                songHref={songHref}
                queue={playQueue}
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
          viewerMemberId={viewerMemberId}
          canModerate={canModerate}
        />
      </section>
    </main>
  );
}
