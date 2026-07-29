import { NextResponse } from 'next/server';
import { getShowAdvanceState, sendShowAdvanceReply } from '@/lib/advance';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';
  try {
    const result = await sendShowAdvanceReply(showId, text);
    const state = await getShowAdvanceState(showId);
    return NextResponse.json({ ...result, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send reply';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
