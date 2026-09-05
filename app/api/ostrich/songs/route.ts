import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { createSong } from '@/lib/band-songs';

export async function POST(request: Request) {
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';
  const notes = typeof body?.notes === 'string' ? body.notes : null;

  const song = await createSong({
    actor,
    title,
    status: body?.status,
    tags: body?.tags,
    notes,
  });
  if (!song) return NextResponse.json({ error: 'A title is required' }, { status: 400 });

  return NextResponse.json({ song });
}
