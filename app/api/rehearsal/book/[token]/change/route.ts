import { NextResponse, after } from 'next/server';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { createChange, parseChangeBody } from '@/lib/rehearsal/requests';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sendRequestEmail } from '@/lib/rehearsal/emails';

// A band asks to change one of its bookings (new time / length / note). It
// lands as a pending request that Alex approves like any other; a confirmed
// original stays until then. Token-authorised, like the request route.

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const band = await getBandByToken(token);
  if (!band) return NextResponse.json({ error: 'This booking link isn’t active.' }, { status: 404 });

  if (!(await checkRateLimit(`rehearsal-change:${band.id}:${getClientIp(request)}`, 10, 600))) {
    return NextResponse.json({ error: 'Too many requests — wait a few minutes and try again.' }, { status: 429 });
  }

  const settings = await getRehearsalSettings();
  const parsed = parseChangeBody(await request.json().catch(() => null), settings.allowedLengths);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await createChange(band.id, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const { requestKey } = outcome;
  after(() => sendRequestEmail(requestKey));
  return NextResponse.json({ ok: true, catalogueId: outcome.catalogueId });
}
