import { NextResponse } from 'next/server';
import {
  getShowAdvanceState,
  saveShowAdvanceDraft,
  sendShowAdvance,
} from '@/lib/advance';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const state = await saveShowAdvanceDraft(showId, body?.vars);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  return NextResponse.json(state);
}

// Send the group advance to the lineup.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  try {
    const result = await sendShowAdvance(showId, body?.vars);
    const state = await getShowAdvanceState(showId);
    return NextResponse.json({ ...result, state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send advance';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
