import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
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
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await removeSongFromGroup(groupId, song);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
