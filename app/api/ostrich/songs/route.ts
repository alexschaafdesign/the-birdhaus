import { NextResponse } from 'next/server';
import { actorForWorkspace } from '@/lib/workspaces';
import { createSong } from '@/lib/band-songs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workspaceId = Number(body?.workspaceId);
  if (!Number.isInteger(workspaceId)) {
    return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
  }
  const actor = await actorForWorkspace(workspaceId);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const title = typeof body?.title === 'string' ? body.title : '';
  const notes = typeof body?.notes === 'string' ? body.notes : null;

  const song = await createSong({
    actor,
    workspaceId,
    title,
    status: body?.status,
    tags: body?.tags,
    notes,
  });
  if (!song) return NextResponse.json({ error: 'A title is required' }, { status: 400 });

  return NextResponse.json({ song });
}
