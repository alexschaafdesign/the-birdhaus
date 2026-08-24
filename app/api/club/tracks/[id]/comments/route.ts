import { NextResponse } from 'next/server';
import { getClubActor, getMemberById } from '@/lib/club-members';
import { createComment, getTrackCommentNotifyTarget, trackComments } from '@/lib/club-music';
import { sendTrackCommentEmail } from '@/lib/club-email';
import { SITE_URL } from '@/lib/site';

// Comment on a track. Returns the refreshed thread for that track, and
// best-effort emails the uploader (if they want comment notifications and
// aren't the one commenting).
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

  await notifyUploader(trackId, actor, text);

  return NextResponse.json({ comments: await trackComments(trackId) });
}

async function notifyUploader(
  trackId: number,
  actor: { memberId: number } | { admin: true },
  comment: string
): Promise<void> {
  try {
    const target = await getTrackCommentNotifyTarget(trackId);
    if (!target || !target.notify) return;
    // Don't email someone about their own comment.
    if ('memberId' in actor && actor.memberId === target.memberId) return;

    const commenterName =
      'admin' in actor
        ? 'the Birdhaus'
        : (await getMemberById(actor.memberId))?.name ?? 'Someone';

    await sendTrackCommentEmail({
      to: target.email,
      uploaderName: target.name,
      commenterName,
      trackTitle: target.title,
      trackUrl: `${SITE_URL}/club/track/${trackId}`,
      comment,
    });
  } catch (e) {
    console.error('[club] track comment notification failed', e);
  }
}
