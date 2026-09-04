import { NextResponse } from 'next/server';
import {
  setShowBandExcluded,
  setShowBandPaid,
  setShowBandPayoutOverride,
  setShowBandPayoutPct,
} from '@/lib/bands';
import { isPaidMethod } from '@/lib/settlements';

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
    // Optional cash/venmo method rides along when marking paid; ignored (and
    // cleared server-side) when unmarking.
    const method = isPaidMethod(body.paidMethod) ? body.paidMethod : null;
    const result = await setShowBandPaid(showId, bandId, body.paid, method);
    if (result === null) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json(result);
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
    // Setting a fixed override clears any percentage share server-side, so tell
    // the client the pct is now null to keep its optimistic state in sync.
    return NextResponse.json({ payoutOverride, payoutPct: raw === null ? undefined : null });
  }

  // `payoutPct` accepts a finite number (percentage of the artist pool) or null
  // (clear it, fall back to the even split). Same `in` check as payoutOverride so
  // a literal null routes here. Setting a pct clears any fixed override.
  if ('payoutPct' in body) {
    const raw = body.payoutPct;
    if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)) {
      return NextResponse.json({ error: 'Invalid payoutPct' }, { status: 400 });
    }
    const payoutPct = await setShowBandPayoutPct(showId, bandId, raw);
    if (payoutPct === undefined) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ payoutPct, payoutOverride: raw === null ? undefined : null });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
