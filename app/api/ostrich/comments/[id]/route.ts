import { NextResponse } from 'next/server';
import { actorForComment } from '@/lib/workspaces';
import { deleteComment } from '@/lib/band-songs';

// Members delete their own comments; workspace owner/staff/admin any.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForComment(id);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if ((await deleteComment(id, scoped.actor)) === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
