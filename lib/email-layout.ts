// The 2027 email shell, shared by every email the app sends. Email HTML, not
// web CSS: nested tables, inline styles only, ~600px wide, fluid below that.
//
// One <style> block only, for dark mode (below), everything else inline. The
// advance email's HTML is also injected into the admin hub preview
// (components/hub/HubAdmin); that path renders with `darkMode: false`, so no
// <style> reaches the admin page at all. No web fonts.
//
// Fonts: CommitMono first (it'll be there for almost nobody), then the system
// mono stack. Designed for the fallback: Gmail shows Menlo/Consolas/Courier.
//
// Dark mode, two kinds of client:
//   * Apple Mail / iOS Mail honour prefers-color-scheme. The document declares
//     `color-scheme: light dark` and carries one small <style> whose rules all
//     sit under `.bh-email` and match only the bh-* classes on these blocks: an
//     ink ground, paper text, the on-ink red, paper buttons, and a paper
//     wordmark swapped in for the ink one.
//   * Gmail ignores that media query and darkens the email's colours itself,
//     but never images. So the wordmark is a transparent PNG with a thin paper
//     outline (legible on paper and on Gmail's dark ground, no box), and the
//     colour bars are a small PNG so Gmail can't shift them. The ink rule after
//     the bars stays a cell: Gmail turns it light, which on its dark ground
//     reads as the same line.
// Every block also sets its own bgcolor and color, so forced inversion keeps
// text and ground together. No text sits on an image.
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


export const EMAIL_FONT = "CommitMono, ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";

// The 2027 wordmark in its medium (primary) weight at 2× (480 wide, shown at
// 240), transparent: the light version (ink with a thin paper outline) and the
// paper version the dark-mode rule swaps in. Hosted with the site's images;
// see scripts/email-wordmark.mjs and scripts/email-bars.mjs.
export const EMAIL_WORDMARK_URL = 'https://images.thebirdhaus.org/email/birdhaus-wordmark-2027-ink-outline@2x.png';
export const EMAIL_WORDMARK_DARK_URL = 'https://images.thebirdhaus.org/email/birdhaus-wordmark-2027-paper@2x.png';
// The rail's five colour bars as one image (2×: 280×8, shown 140×4).
export const EMAIL_BARS_URL = 'https://images.thebirdhaus.org/email/birdhaus-bars-2027@2x.png';
const WORDMARK_W = 240;
const WORDMARK_H = 40;
// The admin shell's smaller mark.
const ADMIN_WORDMARK_W = 180;
const ADMIN_WORDMARK_H = 30;

const C = EMAIL_COLORS;

// The dark palette (Apple Mail / iOS dark mode): surface/ink ground, raised ink
// for boxes, paper text, quiet paper, accent/brick (the one red on ink).
const DARK = { ground: '#16150F', raised: '#1E1B14', text: '#F0EDE4', meta: '#B5AFA2', red: '#CA6252', rule: '#3A372F' };

// Every selector is under .bh-email and only matches bh-* classes, so even
// pasted into a web page it can't touch anything but this email's own blocks.
const DARK_CSS =
  `@media (prefers-color-scheme: dark){` +
  `.bh-email,.bh-email .bh-bg{background:${DARK.ground}!important}` +
  `.bh-email .bh-t{color:${DARK.text}!important}` +
  `.bh-email .bh-m,.bh-email .bh-m a{color:${DARK.meta}!important}` +
  `.bh-email .bh-a,.bh-email .bh-ov{color:${DARK.red}!important}` +
  `.bh-email .bh-btn{background:${DARK.text}!important}` +
  `.bh-email .bh-btn-a{color:${DARK.ground}!important}` +
  `.bh-email .bh-box{background:${DARK.raised}!important;border-color:${DARK.text}!important}` +
  `.bh-email .bh-rule{background:${DARK.rule}!important}` +
  `.bh-email .bh-inkrule{background:${DARK.text}!important}` +
  `.bh-email .bh-h2,.bh-email .bh-img{border-color:${DARK.text}!important}` +
  `.bh-email .bh-wm-l{display:none!important}` +
  `.bh-email .bh-wm-d{display:block!important;max-height:none!important;overflow:visible!important}` +
  `}`;

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
  return `<p class="bh-t" style="margin:0 0 16px;${TEXT}${extra}">${html}</p>`;
}

/** A small, quieter paragraph (fine print, "or paste this link"). */
export function emailSmall(html: string): string {
  return `<p class="bh-m" style="margin:0 0 12px;font-family:${EMAIL_FONT};color:${C.meta};font-size:13px;line-height:1.55;word-break:break-word;">${html}</p>`;
}

/** The red overline label the site uses above sections ("SHOW ADVANCE"). */
export function emailOverline(label: string): string {
  return `<p class="bh-ov" style="margin:0 0 8px;font-family:${EMAIL_FONT};color:${C.red};font-size:11px;line-height:1.3;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">${escapeEmail(label)}</p>`;
}

/** A text link: accent red, underlined. */
export function emailLink(href: string, label: string): string {
  return `<a class="bh-a" href="${escapeEmail(href)}" style="color:${C.red};text-decoration:underline;">${label}</a>`;
}

/** Bulletproof button: a table cell with the fill, square corners, ink fill
 *  and paper text. The whole cell area is the link in clients that allow it. */
export function emailButton(href: string, label: string): string {
  const url = escapeEmail(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:collapse;">` +
    `<tr><td class="bh-btn" bgcolor="${C.ink}" style="background:${C.ink};padding:0;">` +
    `<a class="bh-btn-a" href="${url}" style="display:inline-block;padding:13px 22px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.2;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.paper};text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

/** A bulleted list. Items are trusted HTML. */
export function emailList(items: string[]): string {
  const li = items
    .map((item) => `<li class="bh-t" style="margin:0 0 8px;${TEXT}">${item}</li>`)
    .join('');
  return `<ul class="bh-t" style="margin:0 0 16px;padding:0 0 0 22px;${TEXT}">${li}</ul>`;
}

/** A label: value list (admin details, show info). Values are trusted HTML. */
export function emailDetails(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td class="bh-m" valign="top" style="padding:4px 16px 4px 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.9;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.meta};white-space:nowrap;">${escapeEmail(label)}</td>` +
        `<td class="bh-t" valign="top" style="padding:4px 0;${TEXT}">${value}</td>` +
        `</tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">${tr}</table>`;
}

/** A boxed note: ink hairline on paper-shade. For the advance's "asks". */
export function emailBox(html: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border-collapse:collapse;">` +
    `<tr><td class="bh-box bh-t" bgcolor="${C.paperShade}" style="background:${C.paperShade};border:2px solid ${C.ink};padding:4px 18px 8px;${TEXT}">${html}</td></tr></table>`
  );
}

/** An image block (the RSVP flyer). Fluid: never wider than the column. */
export function emailImage(src: string, alt: string, maxWidth = 500): string {
  return `<p style="margin:0 0 20px;"><img class="bh-img" src="${escapeEmail(src)}" alt="${escapeEmail(alt)}" width="${maxWidth}" style="display:block;width:100%;max-width:${maxWidth}px;height:auto;border:1px solid ${C.ink};"></p>`;
}

// ---- the document ------------------------------------------------------------

// The rail under the wordmark: the five colour bars as one image (Gmail never
// recolours images), then the ink rule as a cell to the right edge.
function bars(barsUrl: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr><td width="140" height="4" style="width:140px;height:4px;font-size:0;line-height:0;">` +
    `<img src="${escapeEmail(barsUrl)}" width="140" height="4" alt="" style="display:block;width:140px;height:4px;border:0;"></td>` +
    `<td class="bh-inkrule" height="4" bgcolor="${C.ink}" style="height:4px;background:${C.ink};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
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
  /** Override the hosted images (previews point them at local files). */
  wordmarkUrl?: string;
  wordmarkDarkUrl?: string;
  barsUrl?: string;
  /** Include the dark-mode <style> (Apple Mail / iOS). Off for HTML that gets
   *  injected into a page (the HubAdmin advance preview). Default on. */
  darkMode?: boolean;
};

export function emailDocument({
  body,
  preheader,
  variant = 'public',
  wordmarkUrl = EMAIL_WORDMARK_URL,
  wordmarkDarkUrl = EMAIL_WORDMARK_DARK_URL,
  barsUrl = EMAIL_BARS_URL,
  darkMode = true,
}: EmailLayoutOptions): string {
  const admin = variant === 'admin';
  const wmW = admin ? ADMIN_WORDMARK_W : WORDMARK_W;
  const wmH = admin ? ADMIN_WORDMARK_H : WORDMARK_H;
  const wmImg = (src: string) =>
    `<img src="${escapeEmail(src)}" width="${wmW}" height="${wmH}" alt="the BIRDHAUS" ` +
    `style="display:block;border:0;outline:none;text-decoration:none;width:${wmW}px;height:auto;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;color:${C.ink};">`;
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};">${escapeEmail(preheader)}</div>`
    : '';
  // The light wordmark, plus (with darkMode) a paper one that stays hidden
  // unless the dark-mode rule shows it: inline display:none, so clients that
  // ignore the media query (Gmail) never show it.
  const wordmark =
    `<a href="${escapeEmail(SITE_URL)}" style="text-decoration:none;">` +
    `<div class="bh-wm-l">${wmImg(wordmarkUrl)}</div>` +
    (darkMode
      ? `<div class="bh-wm-d" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${wmImg(wordmarkDarkUrl)}</div>`
      : '') +
    `</a>`;
  const footer = admin
    ? `<p class="bh-m" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">the BIRDHAUS · admin notice</p>`
    : `<p class="bh-m" style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">A humble DIY music empire in South Minneapolis</p>` +
      `<p class="bh-m" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;letter-spacing:1px;text-transform:uppercase;color:${C.meta};">` +
      `<a href="${escapeEmail(SITE_URL)}" style="color:${C.meta};text-decoration:underline;">thebirdhaus.org</a></p>`;

  const card =
    `<table class="bh-bg" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:100%;max-width:600px;border-collapse:collapse;background:${C.paper};">` +
    `<tr><td class="bh-bg" bgcolor="${C.paper}" style="background:${C.paper};padding:28px 24px 10px;">${wordmark}</td></tr>` +
    `<tr><td style="padding:0 24px 28px;">${bars(barsUrl)}</td></tr>` +
    (admin ? `<tr><td style="padding:0 24px;">${emailOverline('Admin')}</td></tr>` : '') +
    `<tr><td class="bh-bg bh-t" bgcolor="${C.paper}" style="background:${C.paper};padding:0 24px 12px;${TEXT}">${body}</td></tr>` +
    `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td class="bh-rule" height="1" bgcolor="${C.rule}" style="height:1px;background:${C.rule};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
    `<tr><td class="bh-bg" bgcolor="${C.paper}" style="background:${C.paper};padding:16px 24px 32px;">${footer}</td></tr>` +
    `</table>`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // light dark + our own dark rules (Apple Mail / iOS); "light" alone when
    // the dark rules are left out, so those clients keep it as authored.
    `<meta name="color-scheme" content="${darkMode ? 'light dark' : 'light'}">` +
    `<meta name="supported-color-schemes" content="${darkMode ? 'light dark' : 'light'}">` +
    (darkMode ? `<style>${DARK_CSS}</style>` : '') +
    `</head><body class="bh-email" bgcolor="${C.paper}" style="margin:0;padding:0;background:${C.paper};">${pre}` +
    `<table class="bh-email bh-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:100%;border-collapse:collapse;background:${C.paper};">` +
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
