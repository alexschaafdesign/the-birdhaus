import { Resend } from 'resend';
import type { Show } from './shows';
import { splitName } from './name';

const BCC_EMAIL = 'alex@thebirdhaus.org';

// Instantiate lazily rather than at module load: Resend's constructor throws
// when the API key is missing, and Next imports this module during `next build`
// (page-data collection for /api/rsvp), so a build-time absence of the key would
// crash the whole build. Deferring to request time keeps the build independent
// of the runtime secret.
function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

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

// Ported verbatim from the Apps Script `sendConfirmationEmail` function — copy,
// structure, and inline styles unchanged, aside from personalizing the greeting
// (the original always said "hi there!"). Interpolation source moved from
// function args to the show record resolved server-side.
export function renderRsvpConfirmationEmail(
  show: Show,
  name: string
): { subject: string; html: string } {
  const showName = show.title;
  const formattedDate = formatShowDate(show.date);
  const doorsTime = show.doorsTime;
  const showTime = show.showTime;
  const flyerUrl = show.flyer;
  const ticketUrl = show.ticketUrl;
  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';

  const subject = `Your entry info for ${showName}!`;

  const html = `${flyerUrl ? `<p><img src="${flyerUrl}" alt="${showName} flyer" style="max-width: 500px; height: auto; display: block; margin: 20px 0;"></p>` : ''}

<p>${greeting}</p>

<p>Thanks for RSVPing for <strong>${showName}</strong> on ${formattedDate}!</p>

<p>the BIRDHAUS is located at <strong>3721 17th Ave S, Minneapolis MN 55407</strong>, near Powderhorn Park. The house has a red roof, a little free library in front, and a pride flag in the porch window.</p>

<p>Doors open at <strong>${doorsTime}</strong> and music starts at <strong>${showTime}</strong>.</p>

<p>Important -- your RSVP is mostly a way to get the address and help us predict turnout — it doesn't guarantee a spot. If you want to lock in your place, grab an advance ticket:</p>

<p style="margin: 24px 0;">
  <a href="${ticketUrl}" style="background-color: #2A2420; color: #E8E0D0; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    Buy an advance ticket →
  </a>
</p>

<p>(It's rare that we actually sell out, but you never know geez)</p>

<p>There's technically no required entry fee — we take donations via Venmo, cash, or credit card/Apple Pay. Suggested donation is <strong>$20</strong>, but pay what you can. No one will be turned away for lack of funds. It's very important to us to try and pay performers well!! every show, 75% of the door money goes directly to the bands, and 25% to the venue to help cover costs (sound engineer, photographer, etc.) This is generally a better deal than bands get at most venues in town, so your dollar goes a long way here!</p>

<p>A few things to know:</p>
<ul>
  <li>Parking is free on the street — just avoid blocking the median sidewalk across the street, and try keep it quiet coming and going - the backyard is available for hanging outside, rather than the front.</li>
  <li>The shows are in the basement with stairs only, so it is unfortunately not fully accessible.</li>
  <li>My dog Bosco is usually around, somewhat blissed-out on sleepy pills, he might bark when you arrive but he's a real sweetheart.</li>
  <li>I sometimes run a water-based haze machine — but let me know if you have any respiratory concerns and I can skip it!</li>
  <li>There's one main bathroom for guests on the main floor (there's a sign on the door).</li>
  <li>When you get here, just enter through the front door, and then walk straight back through the kitchen to get to the basement.</li>
  <li>ALL AGES and BYOB. There will be some free seltzers/water and light snacks, as far as alcohol/etc you can bring your own and/or maybe you'll be able to find some beers here, who's to say...</li>
</ul>

<p style="color: #888; font-size: 13px; margin-top: 16px;"><em>You're attending this private gathering at your own risk. The hosts are not responsible for any injury, loss, or damage to personal property. Please be respectful of the space, the people, and the neighbors.</em></p>

<p>Let me know if you have any questions or concerns, otherwise see you soon!</p>

<p>alex / the BIRDHAUS</p>
`;

  return { subject, html };
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

  const { subject, html } = renderRsvpConfirmationEmail(show, name);
  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    bcc: BCC_EMAIL,
    subject,
    html,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
