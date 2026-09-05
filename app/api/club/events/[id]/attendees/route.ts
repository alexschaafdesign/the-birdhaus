import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin-session';
import { addAttendee, getEventAttendees, removeAttendee } from '@/lib/club-events';

// Admin-only: curate an event's attendee roster.
// POST { userId }   -> add
// DELETE { userId } -> remove
// Both return the refreshed attendee cards.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return mutate(request, params, 'add');
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return mutate(request, params, 'remove');
}

async function mutate(
  request: Request,
  params: Promise<{ id: string }>,
  action: 'add' | 'remove'
) {
  const eventId = Number((await params).id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = Number(body?.userId); // user ids are bigints → may arrive as strings
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  if (action === 'add') await addAttendee(eventId, userId);
  else await removeAttendee(eventId, userId);

  return NextResponse.json({ attendees: await getEventAttendees(eventId) });
}
