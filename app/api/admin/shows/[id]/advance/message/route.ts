import { NextResponse } from 'next/server';
import { getShowAdvanceState, sendShowMessage } from '@/lib/advance';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

// POST { body, email } — send an admin message on the show's channel. It always
// lands on the thread (admin tab + portal board); with email: true it also goes
// out to the lineup + engineer + extras (watchers CC'd). Works before or after
// the advance itself is sent.
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
  const viaEmail = body?.email !== false;
  try {
    const result = await sendShowMessage(showId, text, { viaEmail });
    const state = await getShowAdvanceState(showId);
    return NextResponse.json({ ...result, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
