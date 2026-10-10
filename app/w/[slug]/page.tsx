import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkspaceBySlug, requireWorkspacePage } from '@/lib/workspaces';
import { distinctTags, listSongs, songComments, songVersions } from '@/lib/band-songs';
import { getScratch, listLyricsRevisions } from '@/lib/band-lyrics';
import { SCRATCH_ID } from '@/lib/lyric-text';
import { getColorLabels } from '@/lib/song-colors';
import LyricsDesk from '@/components/band/LyricsDesk';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const workspace = await getWorkspaceBySlug((await params).slug);
  return {
    title: workspace?.name ?? 'Workspace',
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

// The lyrics desk — the workspace's main room. Every song's words in one
// place, plus the open song's details, recordings, comments and lyrics
// history. ?song=<id> picks the open song (?song=scratch for the scratch
// pad); the desk switches songs with router.replace, so this re-renders with
// the new song's detail while the desk keeps its client state.
export default async function WorkspaceDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ song?: string }>;
}) {
  const { slug } = await params;
  const { song } = await searchParams;
  const { workspace, actor, member } = await requireWorkspacePage(slug, `/w/${slug}`);
  const [songs, scratch, allTags, colorLabels] = await Promise.all([
    listSongs(workspace.id),
    getScratch(workspace.id),
    distinctTags(workspace.id),
    getColorLabels(workspace.id),
  ]);

  // No (valid) pick → the first live song, so there's always detail to show.
  const asked = song && /^\d+$/.test(song) ? Number(song) : null;
  const selectedId =
    song === 'scratch'
      ? SCRATCH_ID
      : asked !== null && songs.some((s) => s.id === asked)
        ? asked
        : ((songs.find((s) => !s.archivedAt) ?? songs[0])?.id ?? SCRATCH_ID);

  const detail =
    selectedId === SCRATCH_ID
      ? null
      : await Promise.all([
          songVersions(selectedId),
          songComments(selectedId),
          listLyricsRevisions(selectedId),
        ]).then(([versions, comments, revisions]) => ({
          songId: selectedId,
          versions,
          comments,
          revisions,
        }));

  // Archived songs are out of the pool; cut ones are still in it.
  const poolSize = songs.filter((s) => !s.archivedAt).length;

  return (
    <main className="mx-auto w-full max-w-[90rem] px-3 pt-4 pb-28 text-[#E8E0D0] sm:px-8 sm:pt-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
          <p className="text-[#E8E0D0]/50">
            <span className="text-2xl font-semibold tabular-nums text-[#c8a26a]">{poolSize}</span>{' '}
            <span className="text-sm">{poolSize === 1 ? 'song' : 'songs'} in the pool</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href={`/w/${workspace.slug}/songs`}
            className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
          >
            Song list &amp; groups →
          </Link>
          {member && <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />}
        </div>
      </header>
      <LyricsDesk
        songs={songs}
        workspace={{ id: workspace.id, slug: workspace.slug }}
        selectedFromServer={selectedId}
        scratch={scratch}
        allTags={allTags}
        colorLabels={colorLabels}
        detail={detail}
        viewerMemberId={member?.id ?? null}
        canModerate={'admin' in actor || actor.staff || actor.owner === true}
      />
    </main>
  );
}
