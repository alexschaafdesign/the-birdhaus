import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { createPost, getPosts } from '@/lib/club-board';
import { notifyAnnouncement } from '@/lib/club-notify';
import { isEventAttendee } from '@/lib/club-events';

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
  const eventId =
    typeof body?.eventId === 'number' && Number.isInteger(body.eventId) ? body.eventId : null;

  // Posting to an event board requires participation (the admin is exempt) —
  // matches the page-level gate.
  if (eventId !== null && author !== 'admin') {
    if (!(await isEventAttendee(eventId, author))) {
      return NextResponse.json({ error: 'Unlock this event first' }, { status: 403 });
    }
  }

  if (!(await createPost(author, text, eventId))) {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  }

  // Only admin posts can email the club, and only when explicitly asked.
  let emailedCount: number | null = null;
  if (author === 'admin' && body?.email === true) {
    try {
      emailedCount = await notifyAnnouncement(text.trim());
    } catch (e) {
      console.error('[club] announcement blast failed', e);
    }
  }

  return NextResponse.json({ posts: await getPosts(eventId), emailedCount });
}
