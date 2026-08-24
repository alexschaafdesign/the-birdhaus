import { NextResponse } from 'next/server';
import { getClubPortalMember } from '@/lib/club-members';
import { addAttendee } from '@/lib/club-events';
import { getEventById } from '@/lib/song-club';

// Self-service participation: a signed-up member declares they took part in an
// event, which instantly unlocks it (adds them to the roster). Trust-based —
// the admin can still remove anyone.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const member = await getClubPortalMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await getEventById(id);
  if (!event || !event.published) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await addAttendee(id, member.id);
  return NextResponse.json({ ok: true });
}
