import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { deleteVersion, updateVersionLabel } from '@/lib/band-songs';

// Rename a version ("demo v2" → "demo v2 — new bridge"): uploader or staff.
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
  const label = typeof body?.label === 'string' ? body.label : '';
  if (!(await updateVersionLabel(id, label, actor))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Uploader or staff. Comments pinned to the version survive (unpinned).
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

  if ((await deleteVersion(id, actor)) === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
