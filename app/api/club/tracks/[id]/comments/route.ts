import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { createComment, trackComments } from '@/lib/club-music';

// Comment on a track. Returns the refreshed thread for that track.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const trackId = Number((await params).id);
  if (!Number.isInteger(trackId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';
  const timestampSeconds =
    typeof body?.timestampSeconds === 'number' ? body.timestampSeconds : null;

  if (!(await createComment({ trackId, actor, body: text, timestampSeconds }))) {
    return NextResponse.json({ error: 'Comment is empty (or the track is gone)' }, { status: 400 });
  }
  return NextResponse.json({ comments: await trackComments(trackId) });
}
