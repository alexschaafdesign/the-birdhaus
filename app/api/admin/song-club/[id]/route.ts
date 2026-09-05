import { NextResponse } from 'next/server';
import {
  updateEvent,
  deleteEvent,
  getEventById,
  buildEventInput,
  type SongClubEventBody,
} from '@/lib/song-club';
import { maybeNotifyEventPublished } from '@/lib/club-notify';
import { requireAdmin } from '@/lib/admin-session';

// Admin-gated by proxy.ts (the /api/admin/* matcher).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
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
  // Publishing a previously-draft event announces it (once — notified_at guards
  // re-sends on later edits).
  let emailedCount: number | null = null;
  if (event) {
    try {
      emailedCount = await maybeNotifyEventPublished(event);
    } catch (e) {
      console.error('[club] event blast failed', e);
    }
  }
  return NextResponse.json({ success: true, event, emailedCount });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Bad id' }, { status: 400 });
  }

  await deleteEvent(id);
  return NextResponse.json({ success: true });
}
