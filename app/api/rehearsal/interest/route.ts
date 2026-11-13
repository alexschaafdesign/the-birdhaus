import { NextResponse, after } from 'next/server';
import { parseLead } from '@/lib/rehearsal/lead-rules';
import { createLead } from '@/lib/rehearsal/leads';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { sendLeadEmails } from '@/lib/rehearsal/emails';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// The public "I'm interested" form. Saves a lead, emails Alex and sends the
// band an auto-reply (after responding). A filled honeypot gets the same
// "thanks" and nothing is saved or sent.
export async function POST(request: Request) {
  const { publicPageEnabled } = await getRehearsalSettings();
  if (!publicPageEnabled) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await checkRateLimit(`rehearsal-interest:${getClientIp(request)}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many tries — wait a bit and try again.' }, { status: 429 });
  }
  const parsed = parseLead(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
  if ('spam' in parsed) return NextResponse.json({ ok: true });
  const id = await createLead(parsed.value);
  after(() => sendLeadEmails(id));
  return NextResponse.json({ ok: true });
}
