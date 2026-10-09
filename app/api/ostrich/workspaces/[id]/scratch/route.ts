import { NextResponse } from 'next/server';
import { actorForWorkspace } from '@/lib/workspaces';
import { saveScratch } from '@/lib/band-lyrics';

// Save the workspace's lyrics-desk scratch pad. Any member of the workspace;
// `autosave: true` may fold into the latest revision (see lib/band-lyrics).
export async function POST(
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
  const text = typeof body?.body === 'string' ? body.body : '';
  await saveScratch({ actor, workspaceId, body: text, autosave: body?.autosave === true });

  return NextResponse.json({ ok: true });
}
