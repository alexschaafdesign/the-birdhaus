import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin-session';
import { createPlaylist } from '@/lib/club-music';
import { setEventRound } from '@/lib/club-events';

// Playlists ("rounds") are admin-created only — v1 decision.
export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';
  const description = typeof body?.description === 'string' ? body.description : null;
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : null;
  // Optional: create this round already linked to an event (from the event hub).
  const eventId =
    typeof body?.eventId === 'number' && Number.isInteger(body.eventId) ? body.eventId : null;

  const playlist = await createPlaylist({ title, description, imageUrl });
  if (!playlist) return NextResponse.json({ error: 'A title is required' }, { status: 400 });
  if (eventId) await setEventRound(eventId, playlist.id);
  return NextResponse.json({ playlist });
}
