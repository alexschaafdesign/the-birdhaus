import { NextResponse } from 'next/server';
import { createEvent, buildEventInput, type SongClubEventBody } from '@/lib/song-club';

// Create a new Song Club event. Admin-gated by proxy.ts (the /api/admin/* matcher).
export async function POST(request: Request) {
  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const event = await createEvent(input);
  return NextResponse.json({ success: true, event });
}
