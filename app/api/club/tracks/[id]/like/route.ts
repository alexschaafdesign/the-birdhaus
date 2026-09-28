import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { toggleTrackLike } from '@/lib/club-music';

// Toggle the caller's heart on a track (like if absent, unlike if present).
// Same gate as commenting: any club actor. Returns the refreshed like list.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const likes = await toggleTrackLike(id, actor);
  if (likes === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ likes });
}
