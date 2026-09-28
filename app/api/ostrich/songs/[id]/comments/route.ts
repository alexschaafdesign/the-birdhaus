import { NextResponse } from 'next/server';
import { actorForSong } from '@/lib/workspaces';
import { createComment } from '@/lib/band-songs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const songId = Number((await params).id);
  if (!Number.isInteger(songId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const scoped = await actorForSong(songId);
  if (!scoped) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const actor = scoped.actor;

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';
  const versionId = typeof body?.versionId === 'number' ? body.versionId : null;
  const timestampSeconds =
    typeof body?.timestampSeconds === 'number' ? body.timestampSeconds : null;

  const ok = await createComment({ songId, actor, body: text, versionId, timestampSeconds });
  if (!ok) return NextResponse.json({ error: 'A comment is required' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
