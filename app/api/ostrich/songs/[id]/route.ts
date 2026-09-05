import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { deleteSong, updateSong } from '@/lib/band-songs';

// Metadata edits are collaborative — any band actor can retitle, retag, or
// move a song through the pipeline.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const song = await updateSong(id, {
    title: typeof body?.title === 'string' ? body.title : undefined,
    status: body?.status,
    tags: body?.tags,
    notes: body?.notes === undefined ? undefined : typeof body.notes === 'string' ? body.notes : null,
    pinned: typeof body?.pinned === 'boolean' ? body.pinned : undefined,
  });
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ song });
}

// Whole-song delete (versions + comments cascade): creator or staff/admin.
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

  if (!(await deleteSong(id, actor))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
