import { NextResponse } from 'next/server';
import {
  updateEvent,
  deleteEvent,
  getEventById,
  buildEventInput,
  catalogueNumberHolder,
  formatCatalogueNumber,
  isCatalogueNumberConflict,
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
  const input = buildEventInput(body, { requireCatalogueNumber: true });
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const holder = input.catalogueNumber !== null ? await catalogueNumberHolder(input.catalogueNumber, id) : null;
  if (holder && input.catalogueNumber !== null) {
    return NextResponse.json(
      { success: false, error: `${formatCatalogueNumber(input.catalogueNumber)} is already used by “${holder}”.` },
      { status: 409 }
    );
  }

  let event;
  try {
    event = await updateEvent(id, input);
  } catch (e) {
    if (isCatalogueNumberConflict(e)) {
      return NextResponse.json(
        { success: false, error: 'That SC number was just taken by another event — reload the page and try again.' },
        { status: 409 }
      );
    }
    throw e;
  }
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
