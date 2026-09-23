import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { saveLyrics } from '@/lib/band-lyrics';

// Save the song's lyrics — appends a revision (no-op if nothing changed).
// Collaborative like song metadata: any band actor.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const songId = Number((await params).id);
  if (!Number.isInteger(songId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';

  const revision = await saveLyrics({ actor, songId, body: text });
  if (!revision) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });

  return NextResponse.json({ revision });
}
