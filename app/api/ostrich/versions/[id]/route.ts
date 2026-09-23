import { NextResponse } from 'next/server';
import { actorForVersion } from '@/lib/workspaces';
import { pinVersionLyrics } from '@/lib/band-lyrics';
import { deleteVersion, updateVersionLabel } from '@/lib/band-songs';

// Rename a version ("demo v2" → "demo v2 — new bridge"): uploader or
// moderator. Re-pinning the lyrics snapshot is collaborative (any workspace
// member), like the lyrics themselves.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForVersion(id);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const actor = scoped.actor;

  const body = await request.json().catch(() => null);

  if ('lyricsRevisionId' in (body ?? {})) {
    const revisionId =
      body.lyricsRevisionId === null ? null : Number(body.lyricsRevisionId);
    if (revisionId !== null && !Number.isInteger(revisionId)) {
      return NextResponse.json({ error: 'Invalid revision' }, { status: 400 });
    }
    if (!(await pinVersionLyrics(id, revisionId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const label = typeof body?.label === 'string' ? body.label : '';
  if (!(await updateVersionLabel(id, label, actor))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Uploader or moderator. Comments pinned to the version survive (unpinned).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForVersion(id);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if ((await deleteVersion(id, scoped.actor)) === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
