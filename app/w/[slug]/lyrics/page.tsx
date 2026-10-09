import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkspaceBySlug, requireWorkspacePage } from '@/lib/workspaces';
import { listSongs } from '@/lib/band-songs';
import { getScratch } from '@/lib/band-lyrics';
import LyricsDesk, { SCRATCH_ID } from '@/components/band/LyricsDesk';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const workspace = await getWorkspaceBySlug((await params).slug);
  return {
    title: workspace ? `Lyrics · ${workspace.name}` : 'Lyrics',
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

// The lyrics desk — every song's words in one place, for jumping between
// songs while writing. ?song=<id> picks the open song (deep links from the
// song page; ?song=scratch for the scratch pad). Workspace members only.
export default async function WorkspaceLyricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ song?: string }>;
}) {
  const { slug } = await params;
  const { song } = await searchParams;
  const { workspace } = await requireWorkspacePage(slug, `/w/${slug}/lyrics`);
  const [songs, scratch] = await Promise.all([listSongs(workspace.id), getScratch(workspace.id)]);
  const initialSongId =
    song === 'scratch' ? SCRATCH_ID : song && /^\d+$/.test(song) ? Number(song) : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pt-6 pb-28 text-[#E8E0D0] sm:px-8 sm:pt-8">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          Lyrics <span className="text-[#E8E0D0]/40">· {workspace.name}</span>
        </h1>
        <Link
          href={`/w/${workspace.slug}`}
          className="text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
        >
          ← All songs
        </Link>
      </header>
      <LyricsDesk
        songs={songs}
        workspace={{ id: workspace.id, slug: workspace.slug }}
        initialSongId={initialSongId}
        scratch={scratch}
      />
    </main>
  );
}
