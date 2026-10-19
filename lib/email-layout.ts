// The 2027 email shell, shared by every email the app sends. Email HTML, not
// web CSS: nested tables, inline styles only, ~600px wide, fluid below that.
//
// No <style> block, on purpose: Gmail drops most of it, and the advance email's
// HTML is also injected into the admin hub preview (components/hub/HubAdmin),
// where a <style> would leak into the page. So no web fonts and no
// prefers-color-scheme rules either.
//
// Fonts: CommitMono first (it'll be there for almost nobody), then the system
// mono stack. Designed for the fallback: Gmail shows Menlo/Consolas/Courier.
//
// Dark mode: the meta tags ask clients that honour them (Apple Mail, iOS) to
// keep it light. Clients that force-invert (Gmail apps, Outlook) invert both
// text and backgrounds together, because every block sets its own bgcolor and
// color. The wordmark PNG has the paper ground baked in, so it stays legible
// whether or not a client inverts images. No text sits on an image.
//
// Pure: no env reads beyond SITE_URL, so templates can be previewed anywhere.

import { SITE_URL } from './site';

export const EMAIL_COLORS = {
  paper: '#F0EDE4', // surface/paper
  paperShade: '#E6E1D4', // surface/paper-shade
  ink: '#16150F', // surface/ink
  red: '#D60023', // accent/red: links and emphasis only
  meta: '#5C584D', // quiet text on paper (≈ ink at 70%, 6:1 on paper)
  rule: '#CFC9BA', // hairlines
} as const;

// The rail's colour bars (components/ui/RailHeader), left to right, then ink.
const BARS = ['#FDC900', '#FF6500', '#FF002A', '#B200D8', '#4C00B9'];

export const EMAIL_FONT = "CommitMono, ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";

// The 2027 wordmark, ink on a baked-in paper ground, at 2× (400×60, shown at
// 200×30). Hosted with the site's images; see scripts/email-wordmark.mjs.
export const EMAIL_WORDMARK_URL = 'https://images.thebirdhaus.org/email/birdhaus-wordmark-2027@2x.png';
const WORDMARK_W = 200;
const WORDMARK_H = 30;

const C = EMAIL_COLORS;

export function escapeEmail(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

// ---- building blocks (each returns an HTML string) ---------------------------

const TEXT = `font-family:${EMAIL_FONT};color:${C.ink};font-size:15px;line-height:1.6;`;

/** A body paragraph. `html` is trusted markup (escape user text first). */
export function emailP(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;${TEXT}${extra}">${html}</p>`;
}

/** A small, quieter paragraph (fine print, "or paste this link"). */
export function emailSmall(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${EMAIL_FONT};color:${C.meta};font-size:13px;line-height:1.55;word-break:break-word;">${html}</p>`;
}

/** The red overline label the site uses above sections ("SHOW ADVANCE"). */
export function emailOverline(label: string): string {
  return `<p style="margin:0 0 8px;font-family:${EMAIL_FONT};color:${C.red};font-size:11px;line-height:1.3;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">${escapeEmail(label)}</p>`;
}

/** A text link: accent red, underlined. */
export function emailLink(href: string, label: string): string {
  return `<a href="${escapeEmail(href)}" style="color:${C.red};text-decoration:underline;">${label}</a>`;
}

/** Bulletproof button: a table cell with the fill, square corners, ink fill
 *  and paper text. The whole cell area is the link in clients that allow it. */
export function emailButton(href: string, label: string): string {
  const url = escapeEmail(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:collapse;">` +
    `<tr><td bgcolor="${C.ink}" style="background:${C.ink};padding:0;">` +
    `<a href="${url}" style="display:inline-block;padding:13px 22px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.2;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.paper};text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

/** A bulleted list. Items are trusted HTML. */
export function emailList(items: string[]): string {
  const li = items
    .map((item) => `<li style="margin:0 0 8px;${TEXT}">${item}</li>`)
    .join('');
  return `<ul style="margin:0 0 16px;padding:0 0 0 22px;${TEXT}">${li}</ul>`;
}

/** A label: value list (admin details, show info). Values are trusted HTML. */
export function emailDetails(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td valign="top" style="padding:4px 16px 4px 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.9;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.meta};white-space:nowrap;">${escapeEmail(label)}</td>` +
        `<td valign="top" style="padding:4px 0;${TEXT}">${value}</td>` +
        `</tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">${tr}</table>`;
}

/** A boxed note: ink hairline on paper-shade. For the advance's "asks". */
export function emailBox(html: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border-collapse:collapse;">` +
    `<tr><td bgcolor="${C.paperShade}" style="background:${C.paperShade};border:2px solid ${C.ink};padding:4px 18px 8px;${TEXT}">${html}</td></tr></table>`
  );
}

/** An image block (the RSVP flyer). Fluid: never wider than the column. */
export function emailImage(src: string, alt: string, maxWidth = 500): string {
  return `<p style="margin:0 0 20px;"><img src="${escapeEmail(src)}" alt="${escapeEmail(alt)}" width="${maxWidth}" style="display:block;width:100%;max-width:${maxWidth}px;height:auto;border:1px solid ${C.ink};"></p>`;
}

// ---- the document ------------------------------------------------------------

function bars(): string {
  const cells = BARS.map(
    (hex) => `<td width="28" height="4" bgcolor="${hex}" style="width:28px;height:4px;background:${hex};font-size:0;line-height:0;">&nbsp;</td>`
  ).join('');
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>${cells}<td height="4" bgcolor="${C.ink}" style="height:4px;background:${C.ink};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
  );
}

export type EmailLayoutOptions = {
  /** The body: built from the blocks above (trusted HTML). */
  body: string;
  /** Inbox preview line; hidden in the email itself. */
  preheader?: string;
  /** "admin" = the minimal shell for crew/admin notices: same wordmark and
   *  colours, smaller, with an ADMIN overline and no public footer line. */
  variant?: 'public' | 'admin';
  /** Overrides the wordmark URL (previews point it at a local file). */
  wordmarkUrl?: string;
};

export function emailDocument({ body, preheader, variant = 'public', wordmarkUrl = EMAIL_WORDMARK_URL }: EmailLayoutOptions): string {
  const admin = variant === 'admin';
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};">${escapeEmail(preheader)}</div>`
    : '';
  const wordmark =
    `<a href="${escapeEmail(SITE_URL)}" style="text-decoration:none;">` +
    `<img src="${escapeEmail(wordmarkUrl)}" width="${admin ? 150 : WORDMARK_W}" height="${admin ? 23 : WORDMARK_H}" alt="the BIRDHAUS" ` +
    `style="display:block;border:0;outline:none;text-decoration:none;width:${admin ? 150 : WORDMARK_W}px;height:auto;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;color:${C.ink};"></a>`;
  const footer = admin
    ? `<p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">the BIRDHAUS · admin notice</p>`
    : `<p style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">A humble DIY music empire in South Minneapolis</p>` +
      `<p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">` +
      `<a href="${escapeEmail(SITE_URL)}" style="color:${C.meta};text-decoration:underline;">thebirdhaus.org</a></p>`;

  const card =
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:100%;max-width:600px;border-collapse:collapse;background:${C.paper};">` +
    `<tr><td bgcolor="${C.paper}" style="background:${C.paper};padding:28px 24px 10px;">${wordmark}</td></tr>` +
    `<tr><td style="padding:0 24px 28px;">${bars()}</td></tr>` +
    (admin ? `<tr><td style="padding:0 24px;">${emailOverline('Admin')}</td></tr>` : '') +
    `<tr><td bgcolor="${C.paper}" style="background:${C.paper};padding:0 24px 12px;${TEXT}">${body}</td></tr>` +
    `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td height="1" bgcolor="${C.rule}" style="height:1px;background:${C.rule};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
    `<tr><td bgcolor="${C.paper}" style="background:${C.paper};padding:16px 24px 32px;">${footer}</td></tr>` +
    `</table>`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `</head><body bgcolor="${C.paper}" style="margin:0;padding:0;background:${C.paper};">${pre}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:100%;border-collapse:collapse;background:${C.paper};">` +
    `<tr><td align="center" style="padding:0;">${card}</td></tr></table></body></html>`
  );
}

// ---- plain text ----------------------------------------------------------------

/** The plain-text footer every text part ends with. */
export function emailTextFooter(variant: 'public' | 'admin' = 'public'): string {
  return variant === 'admin'
    ? '\n\n--\nthe BIRDHAUS · admin notice'
    : `\n\n--\nthe BIRDHAUS\nA humble DIY music empire in South Minneapolis\n${SITE_URL.replace(/^https?:\/\//, '')}`;
}
