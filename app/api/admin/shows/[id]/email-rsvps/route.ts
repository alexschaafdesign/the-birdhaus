import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRsvpsForShow } from '@/lib/rsvps';
import { getShowPurchaseMatches } from '@/lib/square';
import { sendRsvpBlast } from '@/lib/rsvp-email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// One-off blast to everyone who RSVPed for a show. Guarded by proxy.ts admin
// middleware (matches /api/admin/:path*), so no auth check is needed here.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const audience = body?.audience === 'not-bought' ? 'not-bought' : 'all';
  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
  }

  const [show] = await sql<{ id: number }[]>`select id from shows where id = ${showId}`;
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const { rsvps } = await getRsvpsForShow(showId);

  // For the "haven't bought" audience, find which RSVP emails have a matching
  // Square purchase and exclude them.
  const paidEmails =
    audience === 'not-bought'
      ? (await getShowPurchaseMatches(showId, rsvps.map((r) => r.email))).paidEmails
      : new Set<string>();

  // Dedupe by lowercased email so someone who RSVPed twice only gets one copy,
  // drop anything that isn't a valid address, and (for not-bought) skip buyers.
  const seen = new Set<string>();
  const recipients: { name: string; email: string }[] = [];
  const invalid: string[] = [];
  for (const r of rsvps) {
    const email = r.email.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    if (paidEmails.has(key)) continue;
    if (!EMAIL_REGEX.test(email)) {
      invalid.push(email);
      continue;
    }
    recipients.push({ name: r.name, email });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: [], recipientCount: 0, invalid, audience });
  }

  const { sent, failed } = await sendRsvpBlast({ recipients, subject, bodyText: message });

  return NextResponse.json({
    sent,
    failed,
    recipientCount: recipients.length,
    invalid,
    audience,
  });
}
