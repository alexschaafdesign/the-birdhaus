import { NextResponse } from 'next/server';
import { getShowInputsState, saveShowInputs } from '@/lib/inputs';

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
  const state = await getShowInputsState(showId);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  return NextResponse.json(state);
}

// Wholesale-replace the show's input items with the posted list.
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
  const state = await saveShowInputs(showId, body?.items);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  return NextResponse.json(state);
}
