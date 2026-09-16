import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { toggleCommentReaction, trackComments } from '@/lib/club-music';

// Toggle the caller's emoji reaction on a track comment (Slack-style: add if
// absent, remove if present). Same gate as commenting: any club actor.
// Returns the refreshed thread for the comment's track.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === 'string' ? body.emoji : '';

  const trackId = await toggleCommentReaction(id, actor, emoji);
  if (trackId === null) {
    return NextResponse.json({ error: 'Unknown reaction (or the comment is gone)' }, { status: 400 });
  }
  return NextResponse.json({ comments: await trackComments(trackId) });
}
