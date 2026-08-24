import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin-session';
import {
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
} from '@/lib/club-music';

// All playlist management is admin-only (v1 decision).
//
// PATCH accepts any of:
//   { title?, description? }        rename / re-describe
//   { reorder: number[] }           full track-id order
//   { removeTrackId: number }       drop a track from the round (track survives)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (Array.isArray(body?.reorder)) {
    const ids = body.reorder.filter((n: unknown) => Number.isInteger(n)) as number[];
    await reorderPlaylist(id, ids);
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.removeTrackId === 'number') {
    if (!(await removeTrackFromPlaylist(id, body.removeTrackId))) {
      return NextResponse.json({ error: 'Not in this playlist' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (
    typeof body?.title === 'string' ||
    body?.description !== undefined ||
    body?.imageUrl !== undefined
  ) {
    const ok = await updatePlaylist(id, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
      imageUrl: body?.imageUrl !== undefined ? body.imageUrl : undefined,
    });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await deletePlaylist(id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
