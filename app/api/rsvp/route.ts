import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getShowById } from '@/lib/shows';
import { sendRsvpConfirmationEmail } from '@/lib/rsvp-email';
import { upsertMailchimpSubscriber } from '@/lib/mailchimp';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Public endpoint hit by the show page's RSVP form.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const showId = Number(body.showId);
  const name = nullableTrim(body.name);
  const email = nullableTrim(body.email);
  const emailListOptIn = body.emailList === true || body.emailList === 'true';
  const guestsInput = Number.parseInt(String(body.guests), 10);
  const guests = Number.isInteger(guestsInput) && guestsInput > 0 ? guestsInput : 1;

  if (!Number.isInteger(showId) || !name || !email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
  }

  // Re-fetch the show's own record rather than trusting client-posted show
  // details, so a stale or tampered payload can't put wrong info in the
  // confirmation email.
  const show = await getShowById(showId);
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const [rsvp] = await sql`
    insert into rsvps (show_id, name, email, guests, email_list_opt_in)
    values (${showId}, ${name}, ${email}, ${guests}, ${emailListOptIn})
    returning id
  `;

  try {
    await sendRsvpConfirmationEmail({ show, name, email });
    await sql`update rsvps set confirmation_email_sent_at = now() where id = ${rsvp.id}`;
  } catch (err) {
    console.error('[rsvp] Failed to send confirmation email:', err);
  }

  // Non-blocking: a Mailchimp outage must never delay or fail the RSVP response.
  if (emailListOptIn) {
    upsertMailchimpSubscriber({ email, name }).catch((err) => {
      console.error('[rsvp] Mailchimp upsert failed:', err);
    });
  }

  return NextResponse.json({ ok: true });
}
