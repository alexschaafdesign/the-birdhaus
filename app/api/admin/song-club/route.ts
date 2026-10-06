import { NextResponse } from 'next/server';
import {
  createEvent,
  buildEventInput,
  catalogueNumberHolder,
  formatCatalogueNumber,
  isCatalogueNumberConflict,
  type SongClubEventBody,
} from '@/lib/song-club';
import { maybeNotifyEventPublished } from '@/lib/club-notify';
import { requireAdmin } from '@/lib/admin-session';

// Create a new Song Club event. Admin-gated by proxy.ts (the /api/admin/* matcher).
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  if (input.catalogueNumber !== null) {
    const holder = await catalogueNumberHolder(input.catalogueNumber);
    if (holder) {
      return NextResponse.json(
        { success: false, error: `${formatCatalogueNumber(input.catalogueNumber)} is already used by “${holder}”.` },
        { status: 409 }
      );
    }
  }

  let event;
  try {
    event = await createEvent(input);
  } catch (e) {
    if (isCatalogueNumberConflict(e)) {
      return NextResponse.json(
        { success: false, error: 'That SC number was just taken by another event — reload the page and try again.' },
        { status: 409 }
      );
    }
    throw e;
  }
  // Created straight to published -> announce to members who want event emails.
  let emailedCount: number | null = null;
  try {
    emailedCount = await maybeNotifyEventPublished(event);
  } catch (e) {
    console.error('[club] event blast failed', e);
  }
  return NextResponse.json({ success: true, event, emailedCount });
}
