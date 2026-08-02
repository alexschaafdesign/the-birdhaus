import { NextResponse } from 'next/server';
import {
  updateEvent,
  deleteEvent,
  getEventById,
  buildEventInput,
  type SongClubEventBody,
} from '@/lib/song-club';

// Admin-gated by proxy.ts (the /api/admin/* matcher).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await getEventById(id))) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
  }

  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const event = await updateEvent(id, input);
  return NextResponse.json({ success: true, event });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Bad id' }, { status: 400 });
  }

  await deleteEvent(id);
  return NextResponse.json({ success: true });
}
