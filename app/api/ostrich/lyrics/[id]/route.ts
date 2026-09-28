import { NextResponse } from 'next/server';
import { actorForLyricsRevision } from '@/lib/workspaces';
import { deleteLyricsRevision } from '@/lib/band-lyrics';

// Delete one lyrics revision (author or workspace moderator). Missing
// revision, no access, and not-yours all 404 — ids don't leak.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForLyricsRevision(id);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await deleteLyricsRevision(id, scoped.actor))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
