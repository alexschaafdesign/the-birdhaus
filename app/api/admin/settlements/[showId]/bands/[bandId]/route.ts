import { NextResponse } from 'next/server';
import {
  setShowBandExcluded,
  setShowBandPaid,
  setShowBandPayoutOverride,
  setShowBandPayoutPct,
  setShowBandPayoutNote,
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

  // `payoutOverride` accepts a finite number (the dollar amount actually paid) or
  // null (clear it, pay the band exactly what it's due). Note `'payoutOverride' in
  // body` so a literal null still routes here rather than falling through to
  // Invalid body.
  if ('payoutOverride' in body) {
    const raw = body.payoutOverride;
    if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw))) {
      return NextResponse.json({ error: 'Invalid payoutOverride' }, { status: 400 });
    }
    const payoutOverride = await setShowBandPayoutOverride(showId, bandId, raw);
    if (payoutOverride === undefined) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    // Clearing the override also clears its note server-side; surface that so the
    // client's optimistic state stays in sync.
    return NextResponse.json({ payoutOverride, payoutNote: raw === null ? null : undefined });
  }

  // `payoutPct` accepts a finite non-negative number (percentage of the artist
  // pool) or null (clear it, fall back to the even split). Same `in` check as
  // payoutOverride so a literal null routes here.
  if ('payoutPct' in body) {
    const raw = body.payoutPct;
    if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)) {
      return NextResponse.json({ error: 'Invalid payoutPct' }, { status: 400 });
    }
    const payoutPct = await setShowBandPayoutPct(showId, bandId, raw);
    if (payoutPct === undefined) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ payoutPct });
  }

  // `payoutNote` accepts a string (documenting the manual adjustment) or null to
  // clear it. Empty/whitespace is stored as null.
  if ('payoutNote' in body) {
    const raw = body.payoutNote;
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json({ error: 'Invalid payoutNote' }, { status: 400 });
    }
    const payoutNote = await setShowBandPayoutNote(showId, bandId, raw);
    if (payoutNote === undefined) {
      return NextResponse.json({ error: 'Show/band not found' }, { status: 404 });
    }
    return NextResponse.json({ payoutNote });
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}
