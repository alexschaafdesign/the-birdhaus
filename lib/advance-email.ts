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

// Escape a raw string for safe interpolation into the HTML we inject for the
// schedule / callout boxes. The template + vars are admin-authored (trusted), so
// this is defense-in-depth against a stray "<" or "&" breaking the box layout,
// not an untrusted-input boundary.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// One line of the schedule: a time (or time range, e.g. "8–8:30pm") and what's
// happening then. Either may be blank — a bare time or a bare label (e.g.
// "Doors") both render fine. Persisted structured in show_advances.vars.schedule.
export interface ScheduleRow {
  time: string;
  label: string;
}

// Render the schedule as a highlighted box — one row per line, with the time
// bolded to the left of an em-dash. Emits raw HTML (inline styles for email-
// client robustness) rather than Markdown so the rows don't collapse into one
// paragraph; it passes through the Markdown render because that runs with
// sanitize:false. Rows blank on both fields are dropped; an empty list renders
// nothing.
export function formatScheduleBlock(schedule: ScheduleRow[]): string {
  const rows = schedule
    .map((r) => ({ time: r.time.trim(), label: r.label.trim() }))
    .filter((r) => r.time || r.label)
    .map((r) => {
      const cell =
        r.time && r.label
          ? `<b>${escapeHtml(r.time)}</b> &mdash; ${escapeHtml(r.label)}`
          : r.time
            ? `<b>${escapeHtml(r.time)}</b>`
            : escapeHtml(r.label);
      return `<div style="margin:3px 0;">${cell}</div>`;
    })
    .join('');
  if (!rows) return '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;margin:12px 0;background:#fbf3e4;border:1px solid #eaddbf;` +
    `border-left:4px solid #d08a3e;border-radius:5px;"><tr><td ` +
    `style="padding:14px 18px;font-size:14.5px;line-height:1.7;color:#2A2420;">` +
    `${rows}</td></tr></table>`
  );
}

// Wrap an optional per-show note in a Markdown blockquote so it renders as the
// tinted "callout" box (see applyInlineStyles' blockquote styling) — restoring
// the old "highlighted in blue" treatment for the soundcheck note. Each line is
// prefixed so multi-line notes stay inside one blockquote. Empty input renders
// nothing.
export function formatCallout(text: string): string {
  const lines = text.split('\n').map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  if (lines.length === 0) return '';
  return lines.map((l) => `> ${l}`).join('\n');
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

// Low-level Markdown -> HTML. `allowHtml` (sanitize:false) lets our own trusted
// callout/schedule HTML pass through; kept off for reply bodies, which don't need
// it. remark still processes Markdown that sits inside a raw HTML block.
async function mdToHtml(markdown: string, allowHtml = false): Promise<string> {
  const processed = await remark()
    .use(html, allowHtml ? { sanitize: false } : undefined)
    .process(markdown);
  return processed.toString();
}

// Inline styles for the tags remark emits, keyed by tag name. Email clients strip
// <style>/<head> unreliably (and the admin preview injects into a live page), so
// every rule has to ride on the element itself. Applied by string substitution
// because remark's output is small and predictable; text content is already
// HTML-escaped, so a naked "<h2>" only ever appears as a real tag.
const EMAIL_ELEMENT_STYLES: Record<string, string> = {
  h2:
    'margin:34px 0 4px;padding-bottom:8px;border-bottom:2px solid #d8cdb5;' +
    'font-size:16px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#2A2420;',
  h3:
    'margin:22px 0 4px;font-size:12.5px;font-weight:700;letter-spacing:0.09em;' +
    'text-transform:uppercase;color:#a05a26;',
  p: 'margin:10px 0;',
  ul: 'margin:10px 0;padding-left:22px;',
  ol: 'margin:10px 0;padding-left:22px;',
  li: 'margin:4px 0;',
  strong: 'font-weight:700;',
  hr: 'border:none;border-top:1px solid #e0d7c3;margin:24px 0;',
  blockquote:
    'margin:14px 0;padding:12px 16px;background:#eef4fb;border-left:4px solid #3b82f6;' +
    'border-radius:4px;color:#1e3a5f;',
};

function applyInlineStyles(fragment: string): string {
  let out = fragment;
  for (const [tag, style] of Object.entries(EMAIL_ELEMENT_STYLES)) {
    // Only bare tags (no attributes) — our injected schedule box uses <b> and
    // pre-styled <table>/<td> so it's untouched here.
    out = out.replaceAll(`<${tag}>`, `<${tag} style="${style}">`);
  }
  // Links carry an href, so match/insert around it.
  out = out.replace(
    /<a href=/g,
    '<a style="color:#1d4ed8;text-decoration:underline;" href='
  );
  return out;
}

// Wrap the "tl;dr — asks" block (its intro paragraph + the bullet list that
// follows) in a yellow "action required" highlight, so the specific things Alex
// needs back don't get lost in the wall of text. Keyed off the literal "tl;dr"
// that opens the block in the boilerplate — a lightweight convention rather than
// a placeholder, since the asks live in the static template body. If a template
// edit drops that word the block just renders un-boxed (styling is additive, so
// nothing breaks). Runs after applyInlineStyles, so the inner <p>/<ul> keep their
// element styles. Matches through the first list that follows the marker.
function boxAsks(fragment: string): string {
  return fragment.replace(
    /<p[^>]*><strong[^>]*>tl;dr[\s\S]*?<\/ul>/i,
    (block) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="width:100%;margin:16px 0;background:#fff6d6;border:1px solid #f0d98a;` +
      `border-left:4px solid #e0a800;border-radius:5px;"><tr><td ` +
      `style="padding:6px 18px 10px;">${block}</td></tr></table>`
  );
}

// Wrap the styled body in a centered "card" using the bulletproof nested-table
// pattern (Outlook ignores max-width on a div). Adds the small BIRDHAUS kicker.
function wrapEmailShell(styledBody: string): string {
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const kicker =
    `<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;` +
    `font-weight:700;color:#a05a26;">the birdhaus</div>` +
    `<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;` +
    `color:#9a917f;margin-bottom:18px;">show advance</div>`;
  const shell =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;background:transparent;"><tr><td align="center" style="padding:0;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;max-width:600px;margin:0 auto;"><tr><td ` +
    `style="background:#fffdf8;border:1px solid #e7dfce;border-radius:8px;padding:28px 30px;` +
    `font-family:${font};color:#2A2420;font-size:15px;line-height:1.6;">` +
    `${kicker}${styledBody}</td></tr></table></td></tr></table>`;
  // Wrap in a real document so the color-scheme meta tags ride along in the sent
  // mail. This is a light-only design (light card, dark text) with no dark
  // variant, so we tell clients that honor these hints — Apple Mail, iOS Mail,
  // and Outlook to a degree — NOT to auto-invert it into a broken half-dark
  // rendering; they keep it as authored. Gmail strips <head> and applies its own
  // transforms regardless (unavoidable), so this is a best-effort improvement,
  // not a guarantee. The meta tags are inert when this same HTML is injected into
  // the admin preview <div> (the browser ignores <head>/<meta> in that context),
  // so no <style> block — which WOULD leak into the admin page — is used.
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `</head><body style="margin:0;padding:0;background:#ece7db;">${shell}</body></html>`
  );
}

// Renders a plain reply body (Markdown) to email HTML — used for admin replies
// on an existing advance thread, which aren't template-based.
export async function renderReplyHtml(markdown: string): Promise<string> {
  return mdToHtml(markdown);
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
// BEFORE the Markdown pass so a {{show_url}} can sit inside a [link](…), and the
// schedule/callout vars can carry the trusted HTML that sanitize:false lets
// through. The rendered body is then inline-styled and wrapped in the email shell
// so the sent mail is styled the same as the admin preview (email clients drop
// <style>/<head>, so styling must be inline).
export async function renderAdvanceEmail(
  template: { subject: string; body: string },
  vars: AdvanceTemplateVars
): Promise<{ subject: string; html: string; markdown: string }> {
  const subject = substitutePlaceholders(template.subject, vars);
  const markdown = substitutePlaceholders(template.body, vars);
  const body = await mdToHtml(markdown, true);
  const html = wrapEmailShell(boxAsks(applyInlineStyles(body)));
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
// message's recipient address, or null if it isn't one of ours. Used by the
// webhook to attribute a reply to a show. The address may arrive as a bare
// "advance-{token}@domain" or wrapped as "Name <advance-{token}@domain>" (a
// sender's mail client is free to add a display name to the reply recipient), so
// extract the bare address first — otherwise the localpart check reads the
// display name and never matches.
export function parseReplyToken(toAddress: string): string | null {
  const localpart = extractEmailAddress(toAddress).split('@')[0] ?? '';
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
