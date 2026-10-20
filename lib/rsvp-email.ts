import { getResendClient } from './email';
import type { Show } from './shows';
import { splitName } from './name';
import { SITE_URL } from './site';
import { emailButton, emailDocument, emailImage, emailList, emailP, emailSmall, emailTextFooter, escapeEmail } from './email-layout';

const BCC_EMAIL = 'alex@thebirdhaus.org';

// Matches the old Apps Script's `Utilities.formatDate(dateObj, tz, 'EEEE, MMMM d')` —
// weekday + month + day, no year, no ordinal suffix (e.g. "Saturday, August 15").
function formatShowDate(isoDate: string): string {
  const dateObj = new Date(isoDate + 'T00:00:00');
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// The RSVP confirmation (2027 email shell, lib/email-layout). Copy as it was
// (ported from the old Apps Script, then #30's donate wording); the layout is
// new. The donate paragraph and button only appear when the show has a ticket
// link, and the doors line only when both times are set.
export function renderRsvpConfirmationEmail(
  show: Show,
  name: string
): { subject: string; html: string; text: string } {
  const showName = show.title;
  const formattedDate = formatShowDate(show.date);
  const { doorsTime, showTime } = show;
  const flyerUrl = show.flyer;
  // Off production lib/shows' guard may have turned a Square link into a
  // relative /checkout path; an email needs it absolute.
  const ticketUrl = show.ticketUrl?.startsWith('/') ? `${SITE_URL}${show.ticketUrl}` : show.ticketUrl;
  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const e = escapeEmail;

  const subject = `Your entry info for ${showName}!`;

  const address = '3721 17th Ave S, Minneapolis MN 55407';
  const findIt =
    'near Powderhorn Park. The house has a red roof, a little free library in front, and a pride flag in the porch window.';
  const rsvpNote = 'Important -- your RSVP is mostly a way to get the address and help us predict turnout — it doesn\'t guarantee a spot.';
  const donateNote = 'If you want to lock in your place, donate online to guarantee your spot:';
  const soldOutAside = "(It's rare that we actually sell out, but you never know geez)";
  const doorDeal =
    "There's technically no required entry fee — we take donations via Venmo, cash, or credit card/Apple Pay. Suggested donation is $20, but pay what you can. No one will be turned away for lack of funds. It's very important to us to try and pay performers well!! every show, 75% of the door money goes directly to the bands, and 25% to the venue to help cover costs (sound engineer, photographer, etc.) This is generally a better deal than bands get at most venues in town, so your dollar goes a long way here!";
  const thingsToKnow = [
    'Parking is free on the street — just avoid blocking the median sidewalk across the street, and try keep it quiet coming and going - the backyard is available for hanging outside, rather than the front.',
    'The shows are in the basement with stairs only, so it is unfortunately not fully accessible.',
    "My dog Bosco is usually around, somewhat blissed-out on sleepy pills, he might bark when you arrive but he's a real sweetheart.",
    'I sometimes run a water-based haze machine — but let me know if you have any respiratory concerns and I can skip it!',
    "There's one main bathroom for guests on the main floor (there's a sign on the door).",
    'When you get here, just enter through the front door, and then walk straight back through the kitchen to get to the basement.',
    "ALL AGES and BYOB. There will be some free seltzers/water and light snacks, as far as alcohol/etc you can bring your own and/or maybe you'll be able to find some beers here, who's to say...",
  ];
  const waiver =
    "You're attending this private gathering at your own risk. The hosts are not responsible for any injury, loss, or damage to personal property. Please be respectful of the space, the people, and the neighbors.";
  const closing = 'Let me know if you have any questions or concerns, otherwise see you soon!';

  const html = emailDocument({
    preheader: `${showName} · ${formattedDate} · the address and details`,
    body:
      (flyerUrl ? emailImage(flyerUrl, `${showName} flyer`) : '') +
      emailP(e(greeting)) +
      emailP(`Thanks for RSVPing for <strong>${e(showName)}</strong> on ${e(formattedDate)}!`) +
      emailP(`the BIRDHAUS is located at <strong>${address}</strong>, ${findIt}`) +
      (doorsTime && showTime
        ? emailP(`Doors open at <strong>${e(doorsTime)}</strong> and music starts at <strong>${e(showTime)}</strong>.`)
        : '') +
      emailP(ticketUrl ? `${e(rsvpNote)} ${e(donateNote)}` : e(rsvpNote)) +
      (ticketUrl ? emailButton(ticketUrl, 'Donate →') + emailP(e(soldOutAside)) : '') +
      emailP(e(doorDeal).replace('$20', '<strong>$20</strong>')) +
      emailP('A few things to know:', 'margin-bottom:8px;') +
      emailList(thingsToKnow.map(e)) +
      emailSmall(`<em>${e(waiver)}</em>`) +
      emailP(e(closing)) +
      emailP('alex / the BIRDHAUS'),
  });

  const text =
    [
      greeting,
      '',
      `Thanks for RSVPing for ${showName} on ${formattedDate}!`,
      '',
      `the BIRDHAUS is located at ${address}, ${findIt}`,
      ...(doorsTime && showTime ? ['', `Doors open at ${doorsTime} and music starts at ${showTime}.`] : []),
      '',
      ticketUrl ? `${rsvpNote} ${donateNote}` : rsvpNote,
      ...(ticketUrl ? [`Donate: ${ticketUrl}`, '', soldOutAside] : []),
      '',
      doorDeal,
      '',
      'A few things to know:',
      ...thingsToKnow.map((t) => `- ${t}`),
      '',
      waiver,
      '',
      closing,
      '',
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

// Renders an admin-authored plain-text blast: `{name}` (any case) becomes the
// recipient's first name (or "there"); blank lines are paragraphs, single
// newlines line breaks. Escaping happens after token substitution so a first
// name with special chars stays safe. Returns the 2027-shell HTML and the
// personalised plain text.
export function renderRsvpBlast(name: string, bodyText: string): { html: string; text: string } {
  const firstName = splitName(name).firstName || 'there';
  const personalized = bodyText.replace(/\{name\}/gi, firstName);
  const body = escapeHtml(personalized)
    .split(/\n{2,}/)
    .map((paragraph) => emailP(paragraph.replace(/\n/g, '<br>')))
    .join('');
  return { html: emailDocument({ body }), text: personalized + emailTextFooter() };
}

// Sends one custom message to every recipient via Resend's batch API (up to 100
// per request, so we chunk). Each message is personalized, so the batch carries
// distinct html per recipient. Returns a per-recipient failure list; a whole
// chunk is marked failed if its batch request errors. No BCC here (unlike the
// confirmation email) — bcc'ing every message would flood the house inbox.
export async function sendRsvpBlast({
  recipients,
  subject,
  bodyText,
}: {
  recipients: { name: string; email: string }[];
  subject: string;
  bodyText: string;
}): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const client = getResendClient('rsvp-blast');
  const failed: { email: string; error: string }[] = [];
  let sent = 0;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((r) => ({
      from,
      to: r.email,
      subject,
      ...renderRsvpBlast(r.name, bodyText),
    }));

    try {
      const { error } = await client.batch.send(payload);
      if (error) {
        const message = typeof error === 'string' ? error : JSON.stringify(error);
        for (const r of chunk) failed.push({ email: r.email, error: message });
      } else {
        sent += chunk.length;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const r of chunk) failed.push({ email: r.email, error: message });
    }
  }

  return { sent, failed };
}

export async function sendRsvpConfirmationEmail({
  show,
  name,
  email,
}: {
  show: Show;
  name: string;
  email: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const { subject, html, text } = renderRsvpConfirmationEmail(show, name);
  const { error } = await getResendClient('rsvp-confirmation').emails.send({
    from,
    to: email,
    bcc: BCC_EMAIL,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
