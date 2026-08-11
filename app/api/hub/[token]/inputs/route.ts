import { NextResponse } from 'next/server';
import { getShowIdByShareToken } from '@/lib/share-token';
import { getBandInputs, saveBandInputs } from '@/lib/inputs';

// PUBLIC route — token-gated (see stage-plot/route.ts). A band reads and saves
// its OWN input list via the /hub portal. saveBandInputs is band-scoped, so one
// band's save never touches another band's rows (unlike the admin's whole-show PUT).

// GET /api/hub/[token]/inputs?bandId=123 — the band's current items.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const showId = await getShowIdByShareToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const bandId = Number(new URL(request.url).searchParams.get('bandId'));
  if (!Number.isInteger(bandId)) {
    return NextResponse.json({ error: 'bandId required' }, { status: 400 });
  }
  const items = await getBandInputs(showId, bandId);
  return NextResponse.json({ items });
}

// PUT { bandId, items } — replaces just this band's list.
export async function PUT(
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
  // saveBandInputs returns [] when the band isn't in this show's lineup — the
  // token can only touch bands actually playing this show.
  const items = await saveBandInputs(showId, bandId, body?.items);
  return NextResponse.json({ items });
}
