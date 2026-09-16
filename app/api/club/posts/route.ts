import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { createPost, getPosts, getPostScope } from '@/lib/club-board';
import { notifyAnnouncement, notifyGroupPost } from '@/lib/club-notify';
import { isEventAttendee } from '@/lib/club-events';
import { getAttendeeGroupId, getGroup } from '@/lib/club-groups';

// Post to the club board as the logged-in member, or as "the Birdhaus" when
// the visitor holds the admin session instead. Returns the refreshed thread
// (hub-portal pattern) so the UI can swap it in. Admin posts may also blast
// the post to members who opted into announcement emails.
export async function POST(request: Request) {
  // Portal member acts as themselves; a staff-only login (no song_club role)
  // resolves to the admin/"the Birdhaus" author — same identity the page uses.
  const member = await getClubPortalMember();
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
  let groupId = Number.isInteger(groupIdNum) && groupIdNum > 0 ? groupIdNum : null;
  const parentIdNum = Number(body?.parentId);
  const parentId = Number.isInteger(parentIdNum) && parentIdNum > 0 ? parentIdNum : null;

  // A reply lives on its PARENT's board — take the scope from the parent row
  // (never the client) and run the same permission gates as a fresh post
  // there. Replies stay one level deep.
  if (parentId !== null) {
    const parent = await getPostScope(parentId);
    if (!parent) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (parent.parentPostId !== null) {
      return NextResponse.json({ error: "Can't reply to a reply" }, { status: 400 });
    }
    eventId = parent.eventId;
    groupId = parent.groupId;
  }

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

  if (!(await createPost(author, text, eventId, groupId, parentId))) {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  }

  // Only admin TOP-LEVEL posts can email, and only when explicitly asked.
  // Scope is decided HERE, never by the client: a group-board post can only
  // ever email that group's members — the club-wide announcement list is
  // unreachable from a group board.
  let emailedCount: number | null = null;
  if (author === 'admin' && body?.email === true && parentId === null) {
    try {
      emailedCount =
        groupId !== null ? await notifyGroupPost(groupId, text.trim()) : await notifyAnnouncement(text.trim());
    } catch (e) {
      console.error('[club] post email blast failed', e);
    }
  }

  return NextResponse.json({ posts: await getPosts(eventId, groupId), emailedCount });
}
