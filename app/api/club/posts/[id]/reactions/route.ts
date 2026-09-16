import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { getPosts, getPostScope, togglePostReaction } from '@/lib/club-board';
import { isEventAttendee } from '@/lib/club-events';

// Toggle the caller's emoji reaction on a board post (Slack-style: add if
// absent, remove if present). Anyone who can SEE the board can react — group
// boards are readable by every event attendee, so reacting there only needs
// attendance, not group membership (posting is stricter). Returns the
// refreshed thread.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const member = await getClubPortalMember();
  const by = member
    ? { memberId: member.id }
    : (await isAdminSession())
      ? { admin: true as const }
      : null;
  if (!by) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === 'string' ? body.emoji : '';

  const scope = await getPostScope(id);
  if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (scope.eventId !== null && !('admin' in by)) {
    if (!(await isEventAttendee(scope.eventId, by.memberId))) {
      return NextResponse.json({ error: 'Unlock this event first' }, { status: 403 });
    }
  }

  const toggled = await togglePostReaction(id, by, emoji);
  if (!toggled) {
    return NextResponse.json({ error: 'Unknown reaction' }, { status: 400 });
  }
  return NextResponse.json({ posts: await getPosts(toggled.eventId, toggled.groupId) });
}
