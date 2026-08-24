import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin-session';
import { createPlaylist } from '@/lib/club-music';

// Playlists ("rounds") are admin-created only — v1 decision.
export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';
  const description = typeof body?.description === 'string' ? body.description : null;

  const playlist = await createPlaylist({ title, description });
  if (!playlist) return NextResponse.json({ error: 'A title is required' }, { status: 400 });
  return NextResponse.json({ playlist });
}
