import { NextResponse } from 'next/server';
import { setShowBandExcluded, setShowBandPaid } from '@/lib/bands';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ showId: string; bandId: string }> }
) {
  const { showId: showIdParam, bandId: bandIdParam } = await params;
  const showId = parseId(showIdParam);
  const bandId = parseId(bandIdParam);
  if (showId === null || bandId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (typeof body.paid === 'boolean') {
    const paid = await setShowBandPaid(showId, bandId, body.paid);
    if (paid === null) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ paid });
  }

  if (typeof body.excluded === 'boolean') {
    const excluded = await setShowBandExcluded(showId, bandId, body.excluded);
    if (excluded === null) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ excluded });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
