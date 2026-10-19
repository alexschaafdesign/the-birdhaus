// Buyer confirmation for a Square ticket purchase, sent by the Square payment
// webhook. Same lazy Resend client pattern as lib/rsvp-email.ts (missing key
// must never break `next build`), same voice as the RSVP confirmation. BCCs the
// house inbox, which doubles as a passive per-sale heads-up.

import { getResendClient } from './email';
import { SITE_URL } from './site';
import { emailButton, emailDocument, emailP, emailTextFooter } from './email-layout';

const BCC_EMAIL = 'alex@thebirdhaus.org';

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

export type DonationEmailInput = {
  showTitle: string;
  showDate: string; // YYYY-MM-DD
  doorsTime?: string | null;
  showTime?: string | null;
  slug: string;
  quantity: number;
  amountCents: number;
};

// The donation confirmation (2027 email shell, lib/email-layout). Copy as
// updated in #30; the layout is new.
export function renderDonationConfirmationEmail(input: DonationEmailInput): { subject: string; html: string; text: string } {
  const { showTitle, showDate, doorsTime, showTime, slug, quantity, amountCents } = input;
  const formattedDate = formatShowDate(showDate);
  const dollars = `$${(amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
  const spots = quantity === 1 ? 'Your spot is' : `Your ${quantity} spots are`;
  const showUrl = `${SITE_URL}/shows/${slug}`;
  const address = '3721 17th Ave S, Minneapolis MN 55407';
  const findIt =
    'near Powderhorn Park. The house has a red roof, a little free library in front, and a pride flag in the porch window.';
  const atDoor = "No need to print anything — just give your name or email at the door and you're in.";
  const closing = 'Let me know if you have any questions or concerns, otherwise see you soon!';

  const subject = `You're locked in for ${showTitle}!`;

  const html = emailDocument({
    preheader: `${spots} locked in for ${showTitle}.`,
    body:
      emailP('hi!') +
      emailP(
        `Thanks for your ${esc(dollars)} donation for <strong>${esc(showTitle)}</strong> on ${esc(formattedDate)}. ${spots} locked in!`
      ) +
      emailP(`the BIRDHAUS is located at <strong>${address}</strong>, ${findIt}`) +
      (doorsTime && showTime
        ? emailP(`Doors open at <strong>${esc(doorsTime)}</strong> and music starts at <strong>${esc(showTime)}</strong>.`)
        : '') +
      emailP(esc(atDoor)) +
      emailButton(showUrl, 'Show details →') +
      emailP(esc(closing)) +
      emailP('alex / the BIRDHAUS'),
  });

  const text =
    [
      'hi!',
      '',
      `Thanks for your ${dollars} donation for ${showTitle} on ${formattedDate}. ${spots} locked in!`,
      '',
      `the BIRDHAUS is located at ${address}, ${findIt}`,
      ...(doorsTime && showTime ? ['', `Doors open at ${doorsTime} and music starts at ${showTime}.`] : []),
      '',
      atDoor,
      '',
      `Show details: ${showUrl}`,
      '',
      closing,
      '',
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();

  return { subject, html, text };
}

export async function sendTicketConfirmationEmail(opts: DonationEmailInput & { to: string }): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const { subject, html, text } = renderDonationConfirmationEmail(opts);
  const { error } = await getResendClient('ticket-confirmation').emails.send({
    from,
    to: opts.to,
    bcc: BCC_EMAIL,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
