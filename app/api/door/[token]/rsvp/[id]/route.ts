import { NextResponse } from 'next/server';
import { getShowIdByDoorToken } from '@/lib/door-token';
import { bumpRsvpArrivedCount } from '@/lib/rsvps';

// Token-gated door kiosk endpoint (no admin session): tap a name +1 / −1 to count
// how many of that RSVP's party have arrived. Possession of the door token
// authorizes writes to that show's RSVPs only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

  const showId = await getShowIdByDoorToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rsvpId = Number(id);
  if (!Number.isInteger(rsvpId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  // Only single-step nudges — the UI never sends anything but ±1.
  const delta = body?.delta === -1 ? -1 : 1;

  const rsvp = await bumpRsvpArrivedCount(rsvpId, showId, delta);
  if (!rsvp) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ id: rsvp.id, arrivedCount: rsvp.arrived_count });
}
