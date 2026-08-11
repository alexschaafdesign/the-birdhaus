import { NextResponse } from 'next/server';
import { getShowIdByShareToken } from '@/lib/share-token';
import { getPortalThread, recordPortalMessage } from '@/lib/hub-portal';

// PUBLIC route — token-gated (see stage-plot/route.ts). Two-way messaging so the
// advance can live entirely in the portal instead of email. GET returns the
// PII-stripped thread (no addresses); POST adds a band's message.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const showId = await getShowIdByShareToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const messages = await getPortalThread(showId);
  return NextResponse.json({ messages });
}

// POST { bandId, body } — bandId may be null ("Sound engineer / other").
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
  const text = typeof body?.body === 'string' ? body.body : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });
  }
  const rawBandId = body?.bandId;
  const bandId = rawBandId === null || rawBandId === undefined ? null : Number(rawBandId);
  if (bandId !== null && !Number.isInteger(bandId)) {
    return NextResponse.json({ error: 'Invalid band.' }, { status: 400 });
  }

  const ok = await recordPortalMessage({ showId, bandId, body: text });
  if (!ok) {
    return NextResponse.json({ error: "Couldn't post that message." }, { status: 400 });
  }
  const messages = await getPortalThread(showId);
  return NextResponse.json({ messages });
}
