import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { deleteComment } from '@/lib/band-songs';

// Members delete their own comments; staff/admin any.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if ((await deleteComment(id, actor)) === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
