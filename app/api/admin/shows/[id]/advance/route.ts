import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { TV_FEED_TAG } from '@/lib/tv-feed';
import { syncShowTimesFromSchedule } from '@/lib/schedule-sync';

// After a schedule save: the show's public doors / music times follow it
// (lib/schedule-sync), and the TV board is built from it (lib/tv-feed).
async function afterScheduleSave(showId: number) {
  if (await syncShowTimesFromSchedule(showId)) {
    revalidatePath('/shows/[id]', 'page');
    revalidatePath('/');
  }
  revalidateTag(TV_FEED_TAG, { expire: 0 });
}
import {
  getShowAdvanceState,
  saveShowAdvanceDraft,
  sendShowAdvance,
} from '@/lib/advance';
import { requireAdmin } from '@/lib/admin-session';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const state = await getShowAdvanceState(showId);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  return NextResponse.json(state);
}

// Save the composed fields as a draft (no email sent).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const state = await saveShowAdvanceDraft(showId, body?.vars, body?.extraEmails);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  await afterScheduleSave(showId);
  return NextResponse.json(state);
}

// Send the group advance to the lineup.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  try {
    const result = await sendShowAdvance(showId, body?.vars, body?.extraEmails);
    await afterScheduleSave(showId);
    const state = await getShowAdvanceState(showId);
    return NextResponse.json({ ...result, state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send advance';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
