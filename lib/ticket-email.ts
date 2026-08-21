// Buyer confirmation for a Square ticket purchase, sent by the Square payment
// webhook. Same lazy Resend client pattern as lib/rsvp-email.ts (missing key
// must never break `next build`), same voice as the RSVP confirmation. BCCs the
// house inbox, which doubles as a passive per-sale heads-up.

import { Resend } from 'resend';
import { SITE_URL } from './site';

const BCC_EMAIL = 'alex@thebirdhaus.org';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

// e.g. "Saturday, August 15" — matches the RSVP confirmation's date format.
function formatShowDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTicketConfirmationEmail(opts: {
  to: string;
  showTitle: string;
  showDate: string; // YYYY-MM-DD
  doorsTime?: string | null;
  showTime?: string | null;
  slug: string;
  quantity: number;
  amountCents: number;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const { to, showTitle, showDate, doorsTime, showTime, slug, quantity, amountCents } = opts;
  const formattedDate = formatShowDate(showDate);
  const dollars = `$${(amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
  const spots = quantity === 1 ? 'Your spot is' : `Your ${quantity} spots are`;
  const showUrl = `${SITE_URL}/shows/${slug}`;

  const subject = `You're locked in for ${showTitle}!`;

  const html = `
<p>hi!</p>

<p>Thanks so much for your ${esc(dollars)} advance ticket${quantity > 1 ? `s (×${quantity})` : ''} for <strong>${esc(showTitle)}</strong> on ${esc(formattedDate)}. ${spots} locked in!</p>

<p>the BIRDHAUS is located at <strong>3721 17th Ave S, Minneapolis MN 55407</strong>, near Powderhorn Park. The house has a red roof, a little free library in front, and a pride flag in the porch window.</p>

${doorsTime && showTime ? `<p>Doors open at <strong>${esc(doorsTime)}</strong> and music starts at <strong>${esc(showTime)}</strong>.</p>` : ''}

<p>No need to print anything — just give your name or email at the door and you're in.</p>

<p style="margin: 24px 0;">
  <a href="${showUrl}" style="background-color: #2A2420; color: #E8E0D0; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    Show details →
  </a>
</p>

<p>Let me know if you have any questions or concerns, otherwise see you soon!</p>

<p>alex / the BIRDHAUS</p>
`;

  const { error } = await getResendClient().emails.send({
    from,
    to,
    bcc: BCC_EMAIL,
    subject,
    html,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
