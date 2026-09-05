import { NextResponse } from 'next/server';
import { getEventById } from '@/lib/song-club';
import { getRsvpsForEvent } from '@/lib/song-club-rsvps';
import { sendRsvpBlast } from '@/lib/rsvp-email';
import { requireAdmin } from '@/lib/admin-session';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

// One-off blast to everyone who RSVPed for a Song Club event. Guarded by
// proxy.ts admin middleware (matches /api/admin/:path*), so no auth check is
// needed here. Mirrors the show blast (app/api/admin/shows/[id]/email-rsvps),
// minus the Square "not-bought" audience — Song Club events don't sell tickets.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const eventId = parseId(id);
  if (eventId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
  }

  const event = await getEventById(eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const { rsvps } = await getRsvpsForEvent(eventId);

  // Dedupe by lowercased email so someone who RSVPed twice only gets one copy,
  // and drop anything that isn't a valid address.
  const seen = new Set<string>();
  const recipients: { name: string; email: string }[] = [];
  const invalid: string[] = [];
  for (const r of rsvps) {
    const email = r.email.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    if (!EMAIL_REGEX.test(email)) {
      invalid.push(email);
      continue;
    }
    recipients.push({ name: r.name, email });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: [], recipientCount: 0, invalid });
  }

  const { sent, failed } = await sendRsvpBlast({ recipients, subject, bodyText: message });

  return NextResponse.json({ sent, failed, recipientCount: recipients.length, invalid });
}
