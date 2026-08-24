import { NextResponse } from 'next/server';
import { getClubActor } from '@/lib/club-members';
import { deleteComment, trackComments } from '@/lib/club-music';

// Members can delete their own comments; the admin can delete any. Returns
// the refreshed thread for the comment's track.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trackId = await deleteComment(id, actor);
  if (trackId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ comments: await trackComments(trackId) });
}
