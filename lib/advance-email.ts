import { Resend } from 'resend';
import { remark } from 'remark';
import html from 'remark-html';
import { SITE_URL } from './site';

// Alex BCCs himself on every advance so the full thread also lives in his own
// inbox, independent of the admin (mirrors lib/rsvp-email.ts's BCC_EMAIL).
const BCC_EMAIL = 'alex@thebirdhaus.org';

// Instantiate lazily rather than at module load: Resend's constructor throws
// when the API key is missing, and Next imports this module during `next build`,
// so a build-time absence of the key would crash the build. Same reasoning as
// lib/rsvp-email.ts.
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

// Per-show values substituted into the boilerplate template's {{placeholders}}.
// Everything else in the template body is static across shows.
export interface AdvanceTemplateVars {
  // Opening line(s), e.g. "Looking forward to this show woohoo!"
  intro: string;
  // Comma/and-joined band names, e.g. "Hairless Twin, Greydeer & Livestock".
  lineup: string;
  // The show's public RSVP/detail page (bands share this so people can RSVP).
  show_url: string;
  // Formatted show date, e.g. "Saturday, August 15".
  show_date: string;
  // The show engineer's name (from shows.sound_engineer_name).
  sound_engineer: string;
  // Free-text schedule block (load-in / soundcheck / doors / set times).
  schedule: string;
  // Optional per-show note about the soundcheck/linecheck arrangement — the
  // "highlighted in blue" paragraph. Empty string when there's nothing special.
  soundcheck_notes: string;
}

// The per-show placeholders authors can drop into the template, with a short
// description each. Shared by the template editor (Phase 3) and the compose
// screen (Phase 4) so both show the same reference. Keys match AdvanceTemplateVars.
export const ADVANCE_PLACEHOLDERS: ReadonlyArray<{
  key: keyof AdvanceTemplateVars;
  label: string;
}> = [
  { key: 'intro', label: 'Opening line, e.g. "Looking forward to this show woohoo!"' },
  { key: 'lineup', label: 'Band names joined naturally, e.g. "A, B & C"' },
  { key: 'show_url', label: 'Public show / RSVP page URL' },
  { key: 'show_date', label: 'Formatted date, e.g. "Saturday, August 15"' },
  { key: 'sound_engineer', label: "The show's sound engineer name" },
  { key: 'schedule', label: 'Load-in / soundcheck / doors / set-times block' },
  { key: 'soundcheck_notes', label: 'Optional per-show soundcheck note (was highlighted in blue)' },
];

// Build the public show URL bands are pointed at for RSVPs, from the slug.
export function showAdvanceUrl(slug: string): string {
  return `${SITE_URL}/shows/${slug}`;
}

// Matches lib/rsvp-email.ts's formatShowDate: weekday + month + day, no year,
// no ordinal suffix (e.g. "Saturday, August 15").
export function formatAdvanceDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Join band names into a natural-language list: "A", "A & B", "A, B & C".
export function formatLineup(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} & ${clean[clean.length - 1]}`;
}

// Substitute {{key}} placeholders in the (Markdown) template body/subject. Any
// {{unknown}} placeholder is left as-is rather than silently blanked, so a typo
// in the template is visible in the preview instead of vanishing.
export function substitutePlaceholders(
  text: string,
  vars: AdvanceTemplateVars
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return key in vars ? String(vars[key as keyof AdvanceTemplateVars]) : match;
  });
}

async function renderMarkdown(markdown: string): Promise<string> {
  const processed = await remark().use(html).process(markdown);
  return processed.toString();
}

// Renders a plain reply body (Markdown) to email HTML — used for admin replies
// on an existing advance thread, which aren't template-based.
export async function renderReplyHtml(markdown: string): Promise<string> {
  return renderMarkdown(markdown);
}

// Pulls a bare email address out of a From header value, which may be
// "Name <email@x>" or just "email@x". Returns it lowercased for matching.
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

// Renders a composed advance to its final subject + HTML body. The template is
// authored/stored as Markdown so the admin can edit it as plain text and still
// get lists, bold ("highlighted") asks, and links — reusing the same remark
// pipeline lib/shows.ts uses for show content. Placeholders are substituted
// BEFORE the Markdown pass so a {{show_url}} can sit inside a [link](…).
export async function renderAdvanceEmail(
  template: { subject: string; body: string },
  vars: AdvanceTemplateVars
): Promise<{ subject: string; html: string; markdown: string }> {
  const subject = substitutePlaceholders(template.subject, vars);
  const markdown = substitutePlaceholders(template.body, vars);
  const html = await renderMarkdown(markdown);
  return { subject, html, markdown };
}

// Generates the random, unguessable token embedded in the group Reply-To
// (advance+{token}@<domain>). App-side rather than a DB default so we don't
// need a pgcrypto extension on Neon (see migration 031). URL/address-safe hex.
export function generateReplyToken(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// Prefix on the group Reply-To localpart, before the per-show token:
// advance-{token}@<domain>. The webhook parses the token back out of the "to"
// address to find the show.
const REPLY_LOCALPART_PREFIX = 'advance-';

// The group Reply-To. A band's "reply all" reaches both the rest of the lineup
// and this address, which the Resend inbound webhook routes back to the show
// (looked up by the token in the localpart). Domain is the receiving domain
// configured in Resend — the managed "<id>.resend.app" catch-all works out of
// the box (any localpart is delivered), or a custom subdomain later. The token
// lives in the localpart rather than a plus-tag so it doesn't depend on
// plus-addressing support.
export function replyToAddress(token: string): string {
  const domain = process.env.RESEND_ADVANCE_REPLY_DOMAIN;
  if (!domain) throw new Error('RESEND_ADVANCE_REPLY_DOMAIN is not set');
  return `${REPLY_LOCALPART_PREFIX}${token}@${domain}`;
}

// Inverse of replyToAddress: pull the show's reply token out of an inbound
// message's "to" address, or null if it isn't one of ours. Used by the webhook
// (Phase 5) to attribute a reply to a show.
export function parseReplyToken(toAddress: string): string | null {
  const localpart = toAddress.trim().toLowerCase().split('@')[0] ?? '';
  if (!localpart.startsWith(REPLY_LOCALPART_PREFIX)) return null;
  const token = localpart.slice(REPLY_LOCALPART_PREFIX.length);
  return /^[0-9a-f]+$/.test(token) ? token : null;
}

// Sends one group advance email to the whole lineup as a single thread. Returns
// Resend's message id so the caller can persist it on the advance_messages row
// (used for dedupe/threading). DB writes are the caller's job (the API route),
// mirroring how lib/rsvp-email.ts stays send-only.
export async function sendAdvanceEmail({
  toEmails,
  subject,
  html,
  replyToken,
}: {
  toEmails: string[];
  subject: string;
  html: string;
  replyToken: string;
}): Promise<{ id: string }> {
  const from = process.env.RESEND_ADVANCE_FROM_EMAIL;
  if (!from) throw new Error('RESEND_ADVANCE_FROM_EMAIL is not set');
  if (toEmails.length === 0) throw new Error('No recipient emails for advance');

  const { data, error } = await getResendClient().emails.send({
    from,
    to: toEmails,
    bcc: BCC_EMAIL,
    replyTo: replyToAddress(replyToken),
    subject,
    html,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  return { id: data?.id ?? '' };
}

// The seed boilerplate — Alex's canonical advance, authored as Markdown with
// {{placeholders}} for the per-show bits. Inserted as the default template
// (migration 030 / Phase 3 settings screen), after which it's edited in the
// admin, not here. Kept in code so there's a versioned source of truth for the
// starting text.
export const DEFAULT_ADVANCE_SUBJECT = 'the BIRDHAUS advance — {{lineup}}, {{show_date}}';

export const DEFAULT_ADVANCE_BODY = `Hi all,

{{intro}}

Here's a "quick" rundown of everything (i love over-explaining things) — let me know if there are any questions or changes you'd like to make!

this is a little DIY space in the basement of the house i own. i also play in bands and have toured all over for years, and the point is to make this very artist-friendly and comfortable. so far the feedback has been "this rules" and "this is the best sounding basement show i've ever played" lol no big deal don't freak out

**tl;dr — The specific things i need from you, please get them back to me at yer convenience:**

- **each band's input list / stage plot**
- **confirmation of the schedule for load / soundcheck / doors / show**
- **payment info (your Venmo or other method)**

{{soundcheck_notes}}

## GENERAL INFO

### THE VENUE

The Birdhaus is a private, invite-only DIY house venue in south Minneapolis, near Powderhorn Park.

**3721 17TH AVE S, Minneapolis MN 55407**

the house has a red roof, a 'little free library' in front, and a pride flag in the window, and says Birdhaus on the door.

Private venue legal disclaimer yada yada — You're attending at your own risk. The hosts are not responsible for any injury, loss, or damage to personal property. Please be respectful of the space, the people, and the neighbors.

### RSVPs / ADDRESS

In general, please don't post the address publicly, and direct people to the RSVP form at thebirdhaus.org (or the specific link for this show — {{show_url}}) to get the location — when people fill out that form they'll automatically get an email with the address + other details. This helps control how we give out the address, and also to have a rough idea of what the turnout might be.

### CAPACITY

Capacity is 60 — If it fills up, we'll hold back any newcomers until space opens up. At worst, people can hang out in the living room and watch the "TV wall" which will show a camera feed from the basement. This is all in the interest of safety and not letting things get uncomfortably overpacked down there (hitting full capacity is very rare so far).

### ACCESSIBILITY / SAFETY / BATHROOM / DOG

The shows are in the basement (full basement, unfinished but with some sound treatment) — it is unfortunately not fully accessible, there are a couple steps into the house and then a full staircase down to the basement. There's a backyard for smokers, wanna-be-smokers, and anyone else to hang (I prefer this rather than hanging in the front).

I'm very conscious of making this a safe experience for people, in terms of overcrowding (as mentioned above) and fire safety — i've tested the electrical draws to make sure there aren't any obvious risks there, and there are also multiple fire extinguishers down there. There is only one entrance/exit to the basement itself, but the staircase also goes directly to the backyard for a quick emergency exit.

I have a (water-based) haze machine that i love as if it were my own child, but just let me know if you have any respiratory concerns with that and we can easily not use it.

There's one main bathroom for guests on the main floor, AND there's also a 2nd bathroom on the top level which you all can use if need be.

There will be a blissed-out dog around (Bosco, on sleepy pills) who shouldn't cause too much trouble but let me know any potential concerns.

### CAT

So uh, I do not own a cat. lol. i never thought I'd have to include this, but there have been two different shows now where this one orange neighborhood cat was outside and someone assumed it was mine, letting it inside (it only really matters because my dog is a certified Cat Hater/Hunter, i'm looking out for the cat's interests here). So if you see a cat outside… please don't let it in. that's all folks.

### PARKING / LOADING

Parking is free on the street, usually quite easy to get a spot right outside (please try to not block the median sidewalk of the house directly across the street, it's an old woman who is very interested in guarding her "turf").

You can just load in through the front (should be unlocked, just come on in, otherwise ring the doorbell or text me).

### ENTRY FEE / BYOB

We do not require people to buy tickets for entry (i legally can't), and so the entry fee is 'Suggested Donation'. People can also buy 'tickets' ahead of time at the RSVP link, which is the only way to guarantee yourself a spot. There will be multiple signs up in the house, with Venmo / credit card / apple pay information, and a jar for cash as well — and feel free to mention this during the show, in case people missed the donation signs on their way in.

and it's officially BYOB, people can bring their own alcohol if they want, but i'll also have beers for sale here (under the table, do not publicize that plz :D). i'll also have some seltzers/water, and some light snacks etc. No underage drinking whatsoever, that could get this whole party shut down.

### SOUND

Please send me a stage plot / input list so i can get an idea of your setup ahead of time (including total number of performers in your group).

We've got **{{sound_engineer}}** running sound for this one — they're great and I'll also be around for anything you need.

We have a full PA and a pretty comprehensive set-up here, akin to any small music venue.

**BACKLINE / SHARED GEAR**

- **DRUMS** — there's a house kit that i must insist everyone share, for space and time reasons — but of course bring your own breakables (snare/cymbals etc) if you'd like
- **BASS AMP** — there's a house bass amp available
- **GUITAR AMPS** — i have two guitar amps available as well — fender blues jr + peavey classic 30 (let me know if you'd like to use any of the amps)
- **AUDIO/VIDEO RECORDING** — The 'archival' part of the Birdhaus is important to me, i love recording full sets and posting them for posterity. i do one video for the entire set, to cut down on time needed to export individual songs — but if you want i can send you the video file so that you can use/edit to your heart's desire. this includes recording a multitrack of the audio + mixing that afterwards, and then at least one camera angle (sometimes multiple). I'll edit them together afterwards and send to you + post on the website (but let me know if you don't want this for any reason).

## THIS SHOW

### SCHEDULE (proposed)

Let me know any tweaks you want to make, either in soundcheck/linechecks or in the order of bands, etc.

{{schedule}}

### PAY

woohoo transparency → The standard door deal here is 75/25 after the first $100. So this means that the venue keeps the first $100 that comes in, and whatever is above that is split 75/25 between the bands and the venue.

For the record, the venue usually has at least $200 in expenses, including paying a sound engineer and other expenses, and so far I have ~lost money~ on every single show. Which is fine! For now! teehee. But i say that just to be transparent and make clear i'm not in this for The Money — i'm just trying to get ~enough~ to make this thing sustainable for me, along with making it worth it for the artists.

For example, if ticket sales are $400, then the venue would receive $175 (the first $100, plus 25% of the remaining $300 = $75, so $175 total) and the payout to the bands would be $225 (75% of the $300 that's left) — total for all bands, not per-band — a three band bill in this scenario would be $75 per band.

- If ticket sales are $900, the venue gets $300 and the bands get $600.
- If ticket sales are $120, the venue gets $105 and the bands get $15.
- If ticket sales are $40, the venue gets $40 and the bands get $0.

You just have to get above $100 in sales to avoid walking away with nothing.

**Please let me know your Venmo (or other method) and I'll get you the payment ASAP (the next day at the latest).**

### MERCH

There will be a space to sell merch on the main floor if you want! The folding table next to the larger dining table.

### GREEN ROOM / WIFI

There is a room on the main floor (to the right of the bathroom) you can store personal stuff in if you want (keeping the door shut).

WIFI is "Bosco_USI" or "Bosco-5G_USI" — password is zoomies99

### DAY-OF-SHOW CONTACT

Day of the show, send me a text or call (rather than IG DMs) — at 920 809 5713.

I think that's all, let me know anything i'm missing or any other questions you have, and get the highlighted requests to me as soon as you can! thanks!!

alex // the birdhaus
`;
