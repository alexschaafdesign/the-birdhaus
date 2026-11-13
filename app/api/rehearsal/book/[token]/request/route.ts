import { NextResponse } from 'next/server';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { parseRequestBody } from '@/lib/rehearsal/request-rules';
import { createRequest } from '@/lib/rehearsal/requests';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// A band sends a request from its private booking page. Authorised by
// possession of the live link token (no login), like /hub and /door.

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const band = await getBandByToken(token);
  if (!band) return NextResponse.json({ error: 'This booking link isn’t active.' }, { status: 404 });

  if (!(await checkRateLimit(`rehearsal-request:${band.id}:${getClientIp(request)}`, 10, 600))) {
    return NextResponse.json({ error: 'Too many requests — wait a few minutes and try again.' }, { status: 429 });
  }

  const settings = await getRehearsalSettings();
  const parsed = parseRequestBody(await request.json().catch(() => null), settings);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await createRequest(band.id, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, catalogueIds: outcome.catalogueIds });
}
