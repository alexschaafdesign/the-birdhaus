import type { Metadata } from 'next';
import { getWorkspaceBySlug, requireWorkspacePage } from '@/lib/workspaces';
import { distinctTags, listSongs } from '@/lib/band-songs';
import { listGroups } from '@/lib/band-groups';
import BandSongList from '@/components/band/BandSongList';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const workspace = await getWorkspaceBySlug((await params).slug);
  return { title: workspace?.name ?? 'Workspace', robots: { index: false, follow: false } };
}

export const dynamic = 'force-dynamic';

// A songwriter's private song pile — every in-progress song, tagged, statused,
// and grouped. Workspace members only (see requireWorkspacePage).
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, member } = await requireWorkspacePage(slug, `/w/${slug}`);

  const [songs, allTags, groups] = await Promise.all([
    listSongs(workspace.id),
    distinctTags(workspace.id),
    listGroups(workspace.id),
  ]);
  const contenders = songs.filter((s) => s.status === 'contender').length;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{workspace.name}</h1>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">
            The song pile — {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            {contenders > 0 && `, ${contenders} contender${contenders === 1 ? '' : 's'}`}.
          </p>
        </div>
        <div className="shrink-0">
          {member && <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />}
        </div>
      </header>

      <BandSongList
        songs={songs}
        allTags={allTags}
        groups={groups}
        workspace={{ id: workspace.id, slug: workspace.slug }}
      />
    </main>
  );
}
