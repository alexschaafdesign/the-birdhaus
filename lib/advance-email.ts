import { Resend } from 'resend';
import { remark } from 'remark';
import html from 'remark-html';
import { SITE_URL } from './site';

// Alex's own address, CC'd on every outbound advance and admin reply so he's a
// real recipient on the thread — a band's reply-all lands in his inbox directly,
// and he can reply from email or from the admin, like the bands and sound
// engineer. When a band forgets to reply-all, the resend-inbound webhook
// gap-forwards that reply to this address (Alex only, never the engineer — a
// private reply shouldn't be fanned out) so he never misses one.
export const ADVANCE_NOTIFY_EMAIL = 'alex@thebirdhaus.org';

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
  // The band/engineer "show hub" page (/hub/<token>) — schedule, input needs,
  // logistics, RSVP headcount, all in one place. For the lineup + crew, not the
  // public.
  hub_url: string;
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
  { key: 'hub_url', label: 'Band/crew show hub page (schedule, gear, logistics, RSVP count)' },
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
// Standardizes clock times in a schedule's time cell: a bare hour gets ":00"
// (so "5pm" → "5:00pm"), while times that already have minutes, the am/pm
// suffix, range separators, and any non-numeric text (e.g. "Doors") are left
// exactly as typed. Runs on each hour token, so ranges like "8–8:30pm" become
// "8:00–8:30pm".
export function normalizeScheduleTime(time: string): string {
  return time.replace(/(\d{1,2})(:(\d{2}))?/g, (match, hour, minutes) =>
    minutes ? match : `${hour}:00`
  );
}

export function formatScheduleBlock(schedule: ScheduleRow[]): string {
  const rows = schedule
    .map((r) => ({ time: normalizeScheduleTime(r.time.trim()), label: r.label.trim() }))
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

// The standard door/pay deal, shown to the lineup in the /hub portal's "Pay"
// card (a per-show override in show_advances.vars.pay wins when set). This is the
// single source of truth for the default now that the advance email is a short
// portal pointer and no longer carries a PAY section itself. Authored as Markdown
// so the portal renders the bold + bullet examples.
export const DEFAULT_PAY_MARKDOWN = `The standard door deal here is **75/25 after the first $100** — the venue keeps the first $100 that comes in, and whatever's above that is split 75/25 between the bands and the venue.

For the record, the venue usually has at least $200 in expenses (paying a sound engineer + other costs), and so far I've ~lost money~ on every single show. Which is fine! For now! teehee. I mention it just to be transparent — I'm not in this for The Money, just trying to make this sustainable for me while making it worth it for the artists.

Some examples (payout is the total for **all** bands, not per-band):

- $400 in sales → venue $175, bands $225 (a 3-band bill = $75 each)
- $900 in sales → venue $300, bands $600
- $120 in sales → venue $105, bands $15
- $40 in sales → venue $40, bands $0

You just have to clear $100 in sales to avoid walking away with nothing.

**Please send me your Venmo (or other method) and I'll get you paid ASAP — the next day at the latest.**`;

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
    // CC (not BCC) so Alex is a real, visible recipient — a band's reply-all
    // reaches his inbox directly, no forwarding needed.
    cc: ADVANCE_NOTIFY_EMAIL,
    replyTo: replyToAddress(replyToken),
    subject,
    html,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  return { id: data?.id ?? '' };
}

// Pings Alex when a band does something in the /hub advance portal (uploads a
// stage plot, posts a message) so he doesn't have to sit watching the admin.
// Best-effort by design: the caller wraps this so a Resend hiccup never fails
// the band's submission — the data is already saved and visible in the admin.
export async function notifyAdvanceActivity({
  showId,
  showTitle,
  summary,
  detail,
}: {
  showId: number;
  showTitle: string;
  summary: string;
  detail?: string;
}): Promise<void> {
  const from = process.env.RESEND_ADVANCE_FROM_EMAIL;
  if (!from) return; // Not configured (e.g. local) — silently skip.
  const adminUrl = `${SITE_URL}/admin/shows/${showId}/advance`;
  const detailLine = detail ? `<p>${escapeHtml(detail)}</p>` : '';
  await getResendClient().emails.send({
    from,
    to: ADVANCE_NOTIFY_EMAIL,
    subject: `[Advance] ${summary} — ${showTitle}`,
    html:
      `<p>${escapeHtml(summary)} for <strong>${escapeHtml(showTitle)}</strong>.</p>` +
      detailLine +
      `<p><a href="${adminUrl}">Open the advance in the admin →</a></p>`,
  });
}

// The seed boilerplate — Alex's canonical advance, authored as Markdown with
// {{placeholders}} for the per-show bits. Inserted as the default template
// (migration 030 / Phase 3 settings screen), after which it's edited in the
// admin, not here. Kept in code so there's a versioned source of truth for the
// starting text.
export const DEFAULT_ADVANCE_SUBJECT = 'the BIRDHAUS advance — {{lineup}}, {{show_date}}';

export const DEFAULT_ADVANCE_BODY = `Hi all,

{{intro}}

I've put everything you need for this show in one place — your advance portal. No login, no reply-all, and it's the fastest way to get me what I need back.

**In the portal, please:**

- upload your **stage plot / input list**
- confirm the **schedule** (load-in / soundcheck / doors / set times)
- send me your **payment info** (Venmo or other method)
- message me with any questions or changes

> **[Open your advance portal →]({{hub_url}})** — it's got the schedule, gear/input needs, full venue + logistics (address, parking, backline, WiFi, day-of contact), the door/pay deal, and the current RSVP count, all in one spot. (For the lineup + crew — please don't post it publicly.)

{{soundcheck_notes}}

Can't wait for this one — get me the stuff above whenever you can, and reach out with anything at all.

alex // the birdhaus
`;
