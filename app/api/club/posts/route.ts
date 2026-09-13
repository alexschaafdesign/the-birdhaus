import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { createPost, getPosts } from '@/lib/club-board';
import { notifyAnnouncement, notifyGroupPost } from '@/lib/club-notify';
import { isEventAttendee } from '@/lib/club-events';
import { getAttendeeGroupId, getGroup } from '@/lib/club-groups';

// Post to the club board as the logged-in member, or as "the Birdhaus" when
// the visitor holds the admin session instead. Returns the refreshed thread
// (hub-portal pattern) so the UI can swap it in. Admin posts may also blast
// the post to members who opted into announcement emails.
export async function POST(request: Request) {
  const member = await getClubMember();
  const author = member ? member.id : (await isAdminSession()) ? ('admin' as const) : null;
  if (author === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';
  // Event/group ids are bigints → arrive as strings in JSON; coerce.
  const eventIdNum = Number(body?.eventId);
  let eventId = Number.isInteger(eventIdNum) && eventIdNum > 0 ? eventIdNum : null;
  const groupIdNum = Number(body?.groupId);
  const groupId = Number.isInteger(groupIdNum) && groupIdNum > 0 ? groupIdNum : null;

  // Posting to a group board requires membership in THAT group — re-derived
  // from the group row + the attendee row, never trusted from the client.
  // The admin posts anywhere.
  if (groupId !== null) {
    const group = await getGroup(groupId);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    eventId = group.eventId; // the group decides the event scope
    if (author !== 'admin' && (await getAttendeeGroupId(eventId, author)) !== groupId) {
      return NextResponse.json(
        { error: 'Only members of this group can post here' },
        { status: 403 }
      );
    }
  } else if (eventId !== null && author !== 'admin') {
    // Posting to an event board requires participation (the admin is exempt) —
    // matches the page-level gate.
    if (!(await isEventAttendee(eventId, author))) {
      return NextResponse.json({ error: 'Unlock this event first' }, { status: 403 });
    }
  }

  if (!(await createPost(author, text, eventId, groupId))) {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  }

  // Only admin posts can email, and only when explicitly asked. Scope is
  // decided HERE, never by the client: a group-board post can only ever email
  // that group's members — the club-wide announcement list is unreachable
  // from a group board.
  let emailedCount: number | null = null;
  if (author === 'admin' && body?.email === true) {
    try {
      emailedCount =
        groupId !== null ? await notifyGroupPost(groupId, text.trim()) : await notifyAnnouncement(text.trim());
    } catch (e) {
      console.error('[club] post email blast failed', e);
    }
  }

  return NextResponse.json({ posts: await getPosts(eventId, groupId), emailedCount });
}
