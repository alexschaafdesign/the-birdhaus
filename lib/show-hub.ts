import { remark } from 'remark';
import html from 'remark-html';
import { sql } from './db';
import { getShowById } from './shows';
import { getShowInputsState, type InputTotalLine, type InputItem } from './inputs';
import { getRsvpsForShow } from './rsvps';
import { normalizeAdvanceVars } from './advance';
import { getConfirmedSoundEngineer } from './sound-engineers';
import { getShowIdByShareToken } from './share-token';
import { getPortalThread, type PortalMessage } from './hub-portal';
import { getPortalInfo } from './portal-content';
import { DEFAULT_PAY_MARKDOWN, type ScheduleRow } from './advance-email';

// The shareable band/engineer "show hub" (/hub/<token>). Read-only, token-gated,
// outside the admin auth gate — so it deliberately exposes only headcount for
// RSVPs (no attendee names/emails), plus the schedule, input needs, and venue
// logistics the lineup and sound engineer need day-of. Token get/create lives in
// lib/share-token.ts (imported by the advance renderer, which this module imports).

export interface ShowHubData {
  show: {
    title: string;
    date: string | null;
    doorsTime: string | null;
    showTime: string | null;
    flyer: string | null;
    ticketUrl: string | null;
  };
  lineup: string[];
  soundEngineerName: string | null;
  schedule: ScheduleRow[];
  // Optional per-show soundcheck/linecheck note (show_advances.vars) — shown
  // with the schedule so the portal carries it, not just the advance email.
  soundcheckNotes: string;
  inputsTotal: InputTotalLine[];
  inputsByBand: Array<{
    bandId: number;
    name: string;
    items: InputItem[];
    // Stage-plot / input-list files already on file for this band (emailed in or
    // uploaded via the portal), so the portal can show "your files" per band.
    stagePlotAttachments: Array<{ filename: string | null; url: string; contentType: string | null }>;
  }>;
  // Headcount only — no attendee PII. `expected` sums each RSVP's party size
  // ("number of guests including you"), so it's the real expected turnout.
  rsvp: { count: number; expected: number };
  // The door/pay deal (from the show's per-show override when set, else the
  // standard DEFAULT_PAY_MARKDOWN), split for a digestible layout: the headline
  // paragraph and the closing bolded ask stay visible; the middle (examples,
  // fine print) collapses. Trusted, admin-authored Markdown → HTML.
  pay: { introHtml: string; detailsHtml: string; askHtml: string };
  // The venue/logistics rundown (editable portal_info row), split into
  // collapsible sections on its "## " headings so it reads as an accordion
  // instead of one wall of prose. introHtml is anything before the first
  // heading (usually empty). Trusted, admin-authored Markdown → HTML.
  infoIntroHtml: string;
  infoSections: Array<{ title: string; html: string }>;
  // Day-of essentials parsed out of the info text (best-effort — null when the
  // pattern isn't found, and the chip just doesn't render): the venue address,
  // the day-of phone, and the WiFi line.
  quickFacts: { address: string | null; phone: string | null; wifi: string | null };
  // The advance thread, sanitized for the portal (no email addresses) so bands
  // and Alex can message back and forth without email.
  messages: PortalMessage[];
}

async function mdToHtml(markdown: string): Promise<string> {
  if (!markdown.trim()) return '';
  return remark()
    .use(html)
    .process(markdown)
    .then((r) => r.toString());
}

// Split the pay Markdown into headline / fine print / ask. The first paragraph
// is the headline; a final paragraph that opens bold (the "send me your Venmo"
// ask) stays visible; everything between collapses. Degrades cleanly for short
// per-show overrides: with one paragraph, details and ask are just empty.
function splitPayMarkdown(md: string): { intro: string; details: string; ask: string } {
  const paras = md.trim().split(/\n\s*\n/);
  const intro = paras.shift() ?? '';
  let ask = '';
  if (paras.length > 0 && paras[paras.length - 1].trim().startsWith('**')) {
    ask = paras.pop() as string;
  }
  return { intro, details: paras.join('\n\n'), ask };
}

// Split the info Markdown on its "## " headings into accordion sections.
// Content before the first heading (or the whole text, if there are no
// headings) lands in intro, so a heading-less rewrite still renders as prose.
function splitInfoSections(md: string): {
  intro: string;
  sections: Array<{ title: string; body: string }>;
} {
  const intro: string[] = [];
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^##\s+(.+)$/); // exactly h2 — "###" doesn't match
    if (m) {
      current = { title: m[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }
  return {
    intro: intro.join('\n').trim(),
    sections: sections.map((s) => ({ title: s.title, body: s.body.join('\n').trim() })),
  };
}

// Best-effort extraction of the day-of essentials from the (free-form, admin-
// authored) info text, so the portal can pin them up top without maintaining
// the same facts in two places. Each returns null when its pattern isn't found
// — the corresponding chip simply doesn't render.
function extractQuickFacts(md: string): ShowHubData['quickFacts'] {
  // Address: the first bolded line containing a digit (the venue address in the
  // seed text). Bold is how the address is called out in the rundown.
  const address = md.match(/\*\*([^*\n]*\d[^*\n]*\d[^*\n]*)\*\*/)?.[1].trim() ?? null;
  // Day-of phone: the first US-phone-shaped number.
  const phone = md.match(/\b(\d{3})[ .-]?(\d{3})[ .-]?(\d{4})\b/)?.[0] ?? null;
  // WiFi: the first line mentioning WiFi, with the Markdown bold stripped.
  const wifiLine = md.split('\n').find((l) => /wi-?fi/i.test(l) && /\*\*/.test(l));
  const wifi = wifiLine
    ? wifiLine.replace(/\*\*/g, '').replace(/^wi-?fi is\s*/i, '').replace(/\.\s*$/, '').trim()
    : null;
  return { address, phone, wifi };
}

// Assembles everything the hub renders, found by share token. Returns null if the
// token doesn't match a show.
export async function getShowHubData(token: string): Promise<ShowHubData | null> {
  const showId = await getShowIdByShareToken(token);
  if (showId === null) return null;

  const [show, inputs, rsvp, engineer, advanceRows, messages, portalInfo] = await Promise.all([
    getShowById(showId),
    getShowInputsState(showId),
    getRsvpsForShow(showId),
    getConfirmedSoundEngineer(showId),
    sql<Array<{ vars: unknown }>>`select vars from show_advances where show_id = ${showId}`,
    getPortalThread(showId),
    getPortalInfo(),
  ]);
  if (!show) return null;

  const vars = normalizeAdvanceVars(advanceRows[0]?.vars);
  const payMarkdown = vars.pay.trim() || DEFAULT_PAY_MARKDOWN;
  const paySplit = splitPayMarkdown(payMarkdown);
  const infoSplit = splitInfoSections(portalInfo.body);
  const [payIntroHtml, payDetailsHtml, payAskHtml, infoIntroHtml, ...sectionHtml] =
    await Promise.all([
      mdToHtml(paySplit.intro),
      mdToHtml(paySplit.details),
      mdToHtml(paySplit.ask),
      mdToHtml(infoSplit.intro),
      ...infoSplit.sections.map((s) => mdToHtml(s.body)),
    ]);

  return {
    show: {
      title: show.title,
      date: show.date ?? null,
      doorsTime: show.doorsTime ?? null,
      showTime: show.showTime ?? null,
      flyer: show.flyer ?? null,
      ticketUrl: show.ticketUrl ?? null,
    },
    lineup: inputs?.bands.map((b) => b.name) ?? [],
    // The advance's per-show engineer name override wins, then the confirmed one.
    soundEngineerName: vars.sound_engineer.trim() || engineer?.name || null,
    schedule: vars.schedule,
    soundcheckNotes: vars.soundcheck_notes.trim(),
    inputsTotal: inputs?.total ?? [],
    inputsByBand:
      inputs?.bands.map((b) => ({
        bandId: b.bandId,
        name: b.name,
        items: b.items,
        stagePlotAttachments: b.stagePlotAttachments,
      })) ?? [],
    rsvp: { count: rsvp.totalCount, expected: rsvp.totalGuests },
    pay: { introHtml: payIntroHtml, detailsHtml: payDetailsHtml, askHtml: payAskHtml },
    infoIntroHtml,
    infoSections: infoSplit.sections.map((s, i) => ({ title: s.title, html: sectionHtml[i] })),
    quickFacts: extractQuickFacts(portalInfo.body),
    messages,
  };
}
