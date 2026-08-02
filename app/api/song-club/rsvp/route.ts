import { NextResponse } from 'next/server';
import { getEventById } from '@/lib/song-club';
import { createRsvp, markConfirmationSent } from '@/lib/song-club-rsvps';
import { sendRsvpConfirmationEmail } from '@/lib/song-club-email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Public endpoint hit by a Song Club event page's RSVP form.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot: a hidden field real users never see. Bots that fill every input
  // trip it. Pretend success so the bot doesn't learn it was filtered — but
  // skip the DB write and the confirmation email.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  // Each RSVP triggers a Resend email, so cap per IP: 15/hour is well above any
  // real person's usage.
  const allowed = await checkRateLimit(`song-club-rsvp:${getClientIp(request)}`, 15, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many RSVPs from this connection. Please try again later.' },
      { status: 429 }
    );
  }

  const eventId = Number(body.eventId);
  const name = nullableTrim(body.name);
  const email = nullableTrim(body.email);
  const guestsInput = Number.parseInt(String(body.guests), 10);
  const guests = Number.isInteger(guestsInput) && guestsInput > 0 ? guestsInput : 1;

  if (!Number.isInteger(eventId) || !name || !email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  // Re-fetch the event server-side rather than trusting client-posted details,
  // so a stale or tampered payload can't put wrong info in the confirmation
  // email. Only published events accept RSVPs.
  const event = await getEventById(eventId);
  if (!event || !event.published) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const rsvp = await createRsvp({ eventId, name, email, guests });

  try {
    await sendRsvpConfirmationEmail({ event, name, email });
    await markConfirmationSent(rsvp.id);
  } catch (err) {
    // A confirmation-email failure must not fail the RSVP itself — it's already
    // recorded. Log and move on.
    console.error('[song-club/rsvp] Failed to send confirmation email:', err);
  }

  return NextResponse.json({ ok: true });
}
