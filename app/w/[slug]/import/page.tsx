import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkspaceBySlug, requireWorkspacePage } from '@/lib/workspaces';
import { distinctTags, listSongs } from '@/lib/band-songs';
import BandBulkImport from '@/components/band/BandBulkImport';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const workspace = await getWorkspaceBySlug((await params).slug);
  return {
    title: `Import — ${workspace?.name ?? 'Workspace'}`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

// Bulk import: a folder of bounces in, one song per file out.
export default async function WorkspaceImportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspacePage(slug, `/w/${slug}/import`);

  // Existing titles feed the "already a song with this title" nudge; tags
  // feed the batch tag picker.
  const [songs, allTags] = await Promise.all([
    listSongs(workspace.id),
    distinctTags(workspace.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <header className="mb-8">
        <Link
          href={`/w/${workspace.slug}`}
          className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          ← {workspace.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Import demos</h1>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          Drop a folder of audio files — each one becomes a song with the file
          attached as its first version.
        </p>
      </header>

      <BandBulkImport
        allTags={allTags}
        existingTitles={songs.map((s) => s.title)}
        workspace={{ id: workspace.id, slug: workspace.slug }}
      />
    </main>
  );
}
