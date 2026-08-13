import { NextResponse } from 'next/server';
import { getShowIdByShareToken } from '@/lib/share-token';
import { recordPortalDetails } from '@/lib/hub-portal';

// PUBLIC route — token-gated (see stage-plot/route.ts). A band saves its
// non-file advance details: Venmo/payout handle and/or its schedule response.
// Both fields are optional; the client sends whichever block was just saved.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const showId = await getShowIdByShareToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const bandId = Number(body?.bandId);
  if (!Number.isInteger(bandId)) {
    return NextResponse.json({ error: 'Pick your band first.' }, { status: 400 });
  }

  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod : undefined;
  const schedule =
    body?.schedule && typeof body.schedule === 'object'
      ? {
          ok: Boolean(body.schedule.ok),
          changes: typeof body.schedule.changes === 'string' ? body.schedule.changes : '',
        }
      : null;

  // recordPortalDetails re-validates the band is in this show's lineup.
  const ok = await recordPortalDetails({ showId, bandId, paymentMethod, schedule });
  if (!ok) {
    return NextResponse.json({ error: "That band isn't on this show." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
