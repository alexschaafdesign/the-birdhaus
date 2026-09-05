import { NextResponse } from 'next/server';
import { getShowBandsPaidStatus } from '@/lib/bands';
import { requireAdmin } from '@/lib/admin-session';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ showId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { showId: showIdParam } = await params;
  const showId = parseId(showIdParam);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const bands = await getShowBandsPaidStatus(showId);
  return NextResponse.json(bands);
}
