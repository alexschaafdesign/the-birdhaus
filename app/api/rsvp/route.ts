import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getShowById } from '@/lib/shows';
import { sendRsvpConfirmationEmail } from '@/lib/rsvp-email';
import { upsertMailchimpSubscriber, getMailchimpConfigStatus } from '@/lib/mailchimp';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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

  // Honeypot: a hidden field real users never see. Bots that fill every input
  // trip it. Pretend success so the bot doesn't learn it was filtered — but
  // skip the DB write, the confirmation email, and the Mailchimp call.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  // Each RSVP triggers a Resend email + a Mailchimp write, so cap per IP:
  // 15 per hour is well above any real person's usage.
  const allowed = await checkRateLimit(`rsvp:${getClientIp(request)}`, 15, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many RSVPs from this connection. Please try again later.' },
      { status: 429 }
    );
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

  // One RSVP per email per show (migration 075). Re-submitting updates the
  // existing row's name/guests rather than piling up duplicates; opt-in only
  // ever flips on (never silently drops a prior opt-in). Admin-set fields
  // (buyer_email, credited_tickets, arrived/paid) are left untouched.
  const [rsvp] = await sql`
    insert into rsvps (show_id, name, email, guests, email_list_opt_in)
    values (${showId}, ${name}, ${email}, ${guests}, ${emailListOptIn})
    on conflict (show_id, lower(email)) do update
      set name = excluded.name,
          guests = excluded.guests,
          email_list_opt_in = rsvps.email_list_opt_in or excluded.email_list_opt_in
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
    // Distinguish "never configured" from "API rejected the call" — otherwise a
    // missing env var looks identical to a Mailchimp outage in the logs, and an
    // opt-in silently going nowhere is invisible (this exact gap left a month of
    // opt-ins unsynced). The health endpoint /api/health/mailchimp surfaces the
    // same config state for monitoring.
    const mc = getMailchimpConfigStatus();
    if (!mc.configured) {
      console.error(
        `[rsvp] Mailchimp NOT CONFIGURED (apiKey=${mc.apiKeyPresent} audience=${mc.audiencePresent}) — ` +
          `mailing-list opt-in DROPPED for ${email}. Set MAILCHIMP_API_KEY and MAILCHIMP_AUDIENCE_ID.`
      );
    } else {
      upsertMailchimpSubscriber({ email, name }).catch((err) => {
        console.error('[rsvp] Mailchimp upsert failed (API error):', err);
      });
    }
  }

  return NextResponse.json({ ok: true });
}
