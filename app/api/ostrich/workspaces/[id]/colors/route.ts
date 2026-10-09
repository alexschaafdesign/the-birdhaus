import { NextResponse } from 'next/server';
import { actorForWorkspace } from '@/lib/workspaces';
import { setColorLabels } from '@/lib/song-colors';

// Rename the workspace's song colors (the legend). Collaborative like song
// metadata: any member of the workspace. Body: { labels: { green: "…" } } —
// the whole map; colors left out lose their name.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = Number((await params).id);
  if (!Number.isInteger(workspaceId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await actorForWorkspace(workspaceId);
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const labels = await setColorLabels(workspaceId, body?.labels);
  return NextResponse.json({ labels });
}
