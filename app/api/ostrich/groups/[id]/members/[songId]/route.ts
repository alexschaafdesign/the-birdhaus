import { NextResponse } from 'next/server';
import { actorForGroup } from '@/lib/workspaces';
import { removeSongFromGroup } from '@/lib/band-groups';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  const { id, songId } = await params;
  const groupId = Number(id);
  const song = Number(songId);
  if (!Number.isInteger(groupId) || !Number.isInteger(song)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForGroup(groupId);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await removeSongFromGroup(groupId, song);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
