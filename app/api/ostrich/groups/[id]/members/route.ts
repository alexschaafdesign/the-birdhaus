import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { addSongToGroup, setGroupOrder } from '@/lib/band-groups';

// POST adds one song (appends at the end); PUT replaces the group's order
// with the full id list from a drag reorder.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const songId = Number(body?.songId);
  if (!Number.isInteger(songId)) {
    return NextResponse.json({ error: 'Invalid song' }, { status: 400 });
  }

  const ok = await addSongToGroup(groupId, songId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const songIds = Array.isArray(body?.songIds)
    ? (body.songIds as unknown[]).map(Number).filter((n) => Number.isInteger(n))
    : null;
  if (!songIds) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });

  const ok = await setGroupOrder(groupId, songIds);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
