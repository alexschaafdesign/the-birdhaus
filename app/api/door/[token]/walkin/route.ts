import { NextResponse } from 'next/server';
import { getShowIdByDoorToken } from '@/lib/door-token';
import { bumpWalkinCount } from '@/lib/door';

// Token-gated door kiosk endpoint: tally an anonymous walk-in (+1) or undo one
// (−1). No name is collected — this only feeds the total show headcount.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const showId = await getShowIdByDoorToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const delta = body?.delta === -1 ? -1 : 1;

  const walkinCount = await bumpWalkinCount(showId, delta);
  return NextResponse.json({ walkinCount });
}
