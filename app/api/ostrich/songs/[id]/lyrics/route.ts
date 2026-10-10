import { NextResponse } from 'next/server';
import { actorForSong } from '@/lib/workspaces';
import { saveLyrics } from '@/lib/band-lyrics';

// Save the song's lyrics — appends a revision (no-op if nothing changed).
// `autosave: true` (the lyrics desk) may fold into the latest revision instead.
// Collaborative like song metadata: any member of the song's workspace.
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

  const revision = await saveLyrics({ actor, songId, body: text, autosave: body?.autosave === true });
  if (!revision) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });

  return NextResponse.json({ revision });
}
