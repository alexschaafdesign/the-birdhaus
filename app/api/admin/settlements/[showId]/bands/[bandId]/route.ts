import { NextResponse } from 'next/server';
import { setShowBandExcluded, setShowBandPaid, setShowBandPayoutOverride } from '@/lib/bands';

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

  // `payoutOverride` accepts a finite number (fixed payout) or null (clear the
  // override, fall back to the even split). Note `'payoutOverride' in body` so a
  // literal null still routes here rather than falling through to Invalid body.
  if ('payoutOverride' in body) {
    const raw = body.payoutOverride;
    if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw))) {
      return NextResponse.json({ error: 'Invalid payoutOverride' }, { status: 400 });
    }
    const payoutOverride = await setShowBandPayoutOverride(showId, bandId, raw);
    if (payoutOverride === undefined) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ payoutOverride });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
