import { NextResponse } from 'next/server';
import { actorForGroup } from '@/lib/workspaces';
import { deleteGroup, renameGroup } from '@/lib/band-groups';

// Collaborative like song metadata: any band actor may rename or delete any
// group. Deleting a group only drops memberships — never songs.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForGroup(groupId);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const ok = await renameGroup(groupId, name);
  if (!ok) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForGroup(groupId);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await deleteGroup(groupId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
