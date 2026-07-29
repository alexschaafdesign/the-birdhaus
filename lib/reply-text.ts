// Presentation helpers for showing an inbound advance reply in the admin thread.
// Kept dependency-free (no Resend/remark imports) so it's safe to pull into the
// client ShowAdvancePanel bundle.

// Decode the handful of HTML entities that show up in email text parts. Not a
// full entity table — just the ones worth handling for readable display.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Best-effort HTML -> plain text for replies that arrive with only an HTML part
// (no text/plain). We render this as TEXT, never as HTML, so untrusted inbound
// markup from an external sender can't execute in the admin. Drops script/style,
// turns block boundaries into newlines, strips the rest of the tags.
export function htmlToText(html: string): string {
  // Drop the quoted history first: mail clients wrap it in a <blockquote> or a
  // gmail_quote container, which survives tag-stripping as an unmarked run of
  // text (no ">"/"wrote:" for splitReplyQuote to catch). Cutting it here keeps
  // the HTML-only fallback as clean as the text/plain path.
  const quoteStart = html.search(/<blockquote|<div[^>]+class="[^"]*gmail_quote/i);
  const main = quoteStart >= 0 ? html.slice(0, quoteStart) : html;
  const text = main
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Split a reply into the sender's new message and the quoted history below it
// (the original advance, re-quoted by the mail client). Returns the new part in
// `body` and everything from the first quote boundary onward in `quoted`, so the
// admin can show the reply clean and reveal the quote on demand. If no boundary
// is found, the whole thing is `body`.
//
// Boundaries covered: Gmail/Apple "On <date> <someone> wrote:", a run of ">"
// quote lines, Outlook's "-----Original Message-----" / long underscore rule /
// "From:" header block. We cut at the earliest of whichever appear.
export function splitReplyQuote(text: string): { body: string; quoted: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  const boundaries: RegExp[] = [
    /^On\b[\s\S]*?\bwrote:\s*$/m, // "On Mon, Jul 28, 2026 ... wrote:" (may wrap)
    /^>.*$/m, // first quoted line
    /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^_{5,}\s*$/m, // Outlook's underscore divider
    /^From:.*$/m, // Outlook header block
  ];
  let cut = -1;
  for (const re of boundaries) {
    const m = normalized.match(re);
    if (m && m.index !== undefined && (cut === -1 || m.index < cut)) {
      cut = m.index;
    }
  }
  if (cut === -1) return { body: normalized.trim(), quoted: '' };
  return {
    body: normalized.slice(0, cut).trim(),
    quoted: normalized.slice(cut).trim(),
  };
}
