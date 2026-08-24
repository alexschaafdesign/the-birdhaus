import { NextResponse } from 'next/server';
import { createEvent, buildEventInput, type SongClubEventBody } from '@/lib/song-club';
import { maybeNotifyEventPublished } from '@/lib/club-notify';

// Create a new Song Club event. Admin-gated by proxy.ts (the /api/admin/* matcher).
export async function POST(request: Request) {
  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const event = await createEvent(input);
  // Created straight to published -> announce to members who want event emails.
  let emailedCount: number | null = null;
  try {
    emailedCount = await maybeNotifyEventPublished(event);
  } catch (e) {
    console.error('[club] event blast failed', e);
  }
  return NextResponse.json({ success: true, event, emailedCount });
}
