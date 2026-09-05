import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { deleteTrack } from '@/lib/club-music';

// Members can delete their own tracks; the admin can delete any.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await deleteTrack(id, actor))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
