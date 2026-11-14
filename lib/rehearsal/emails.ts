import { sql } from '../db';
import { getResendClient } from '../email';
import { SITE_URL } from '../site';
import {
  emailButton,
  emailDetails,
  emailDocument,
  emailLink,
  emailOverline,
  emailP,
  emailSmall,
  emailTextFooter,
  escapeEmail as esc,
  EMAIL_COLORS,
} from '../email-layout';
import { getRehearsalSettings } from './settings';
import { bookingUrl } from './bands';
import { clashesFor } from './availability-data';
import { bookingsByIds, bookingsByRequest, markEmailed, repeatLabel, type AdminBooking } from './decisions';
import { linkSecret, signLink } from './signed-links.ts';
import { venmoAmount, venmoMemo, venmoPayUrl } from './venmo.ts';
import { describeRule, type Freq } from './series.ts';
import { getLead, leadSummary } from './leads';
import { FREQUENCY_LABEL } from './lead-rules.ts';
import { chicagoDate } from './availability.ts';
import { buildIcs } from './ics-out.ts';
import { lengthLabel, rateCardLines, usualRateFor, type RateCardInput } from './estimate.ts';
import { longDay, money, sessionLabel, shortDay, timeRange } from './format.ts';
import type { Reason } from './availability.ts';

// Rehearsal emails, all through getResendClient (blocked or redirected off
// production by lib/staging.ts). Each send records its timestamp on the
// bookings (migration 113) so admin can see a failed send and resend it.
// A failure is logged and returned, never thrown into the caller's write.

const ADMIN_TO = () => process.env.ADMIN_NOTIFY_EMAIL || 'alex@thebirdhaus.org';
const REPLY_TO = 'alex@thebirdhaus.org';

const REASON_TEXT: Record<Reason, string> = {
  show: 'a show is on that day',
  unavailable_day: 'that day is marked Not available in Booking',
  blackout: 'a rehearsal blackout covers it',
  busy: 'your calendar is busy then',
  booked: 'another booking overlaps it',
  past: 'it has already started',
  window: 'it is outside the booking window',
};

type Mail = {
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
};

async function send(m: Mail): Promise<boolean> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    console.error(`[rehearsal-email] ${m.template}: RESEND_FROM_EMAIL is not set`);
    return false;
  }
  try {
    const { error } = await getResendClient(m.template).emails.send({
      from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.attachments ? { attachments: m.attachments } : {}),
    });
    if (error) {
      console.error(`[rehearsal-email] ${m.template} failed: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[rehearsal-email] ${m.template} threw`, e);
    return false;
  }
}

async function liveLink(bandId: number): Promise<string | null> {
  const [row] = await sql<{ token: string }[]>`
    select token from rehearsal_band_links where band_id = ${bandId} and revoked_at is null
  `;
  return row ? bookingUrl(row.token) : null;
}

async function bandContact(bandId: number) {
  const [row] = await sql<{ name: string; contactName: string; email: string; phone: string }[]>`
    select name, contact_name as "contactName", email, phone from rehearsal_bands where id = ${bandId}
  `;
  return row;
}

function gearLine(b: Pick<AdminBooking, 'gearNeeded' | 'gearNotes'>): string {
  return [b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — ');
}

// A confirmed batch that's exactly one repeating series, summarised for the
// band: headline, the next few dates after the first, and gear (once if it's
// the same for all, else per date). Null for single or mixed bookings.
function seriesSummary(list: AdminBooking[]): { headline: string; next: string[]; gear: string; gearByDate: string[] } | null {
  if (list.length < 2) return null;
  const sid = list[0].seriesId;
  const freq = list[0].seriesFreq;
  if (sid == null || !freq || list.some((b) => b.seriesId !== sid)) return null;
  const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const first = sorted[0];
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/Chicago' }).format(first.startsAt);
  const rule =
    freq === 'weekly'
      ? `Every ${weekday}`
      : freq === 'biweekly'
        ? `Every other ${weekday}`
        : describeRule(chicagoDate(first.seriesStart ?? first.startsAt), freq);
  const headline = `${rule}, ${timeRange(first.startsAt, first.endsAt)}, starting ${shortDay(first.startsAt)}`;
  const next = sorted.slice(1, 4).map((b) => shortDay(b.startsAt));
  const gears = sorted.map(gearLine);
  const same = gears.every((g) => g === gears[0]);
  return {
    headline,
    next,
    gear: same ? gears[0] : '',
    gearByDate: same ? [] : sorted.map((b, i) => (gears[i] ? `${shortDay(b.startsAt)} gear: ${gears[i]}` : '')).filter(Boolean),
  };
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => emailP(esc(p.trim()).replace(/\n/g, '<br>')))
    .join('');
}

const reviewUrl = (token: string) => `${SITE_URL}/rehearsal/review/${token}`;

// --- band-facing voice: short, casual, first person, signed by Alex ----------------

function hey(contactName: string): string {
  const first = contactName.trim().split(/\s+/)[0];
  return first ? `Hey ${first},` : 'Hey!';
}

const SIGN = '— Alex';

// Plain text paragraphs -> email paragraphs (blank line = new paragraph).
function bandEmail(preheader: string, blocks: string[]): string {
  return emailDocument({ preheader, body: blocks.join('') + emailP(esc(SIGN)) });
}


// --- 1. New request -> Alex ---------------------------------------------------

export async function sendRequestEmail(requestKey: string): Promise<boolean> {
  const list = (await bookingsByRequest(requestKey)).filter((b) => b.status === 'pending');
  if (list.length === 0) return false;
  const band = await bandContact(list[0].bandId);
  const { reasons, calendarChecked } = await clashesFor(list);
  const settings = await getRehearsalSettings();
  const { paymentsEnabled } = settings;
  const rate = list[0].rateNotes;
  // Soft usual-rate lines (one per distinct length/repeat), beside the rate notes.
  const usual = [...new Set(list.map((b) => usualRateFor(b.startsAt, b.endsAt, b.seriesFreq, settings)).filter((x): x is string => Boolean(x)))];
  // The band name, with Alex's private rate notes beside it.
  const bandHtml = `<strong>${esc(band.name)}</strong>${rate ? ` <span style="color:${EMAIL_COLORS.meta};">(${esc(rate)})</span>` : ''}`;
  const bandText = `${band.name}${rate ? ` (${rate})` : ''}`;
  const secret = linkSecret();
  const approveAll = reviewUrl(signLink({ a: 'approve', k: requestKey }, secret));
  const declineAll = reviewUrl(signLink({ a: 'decline', k: requestKey }, secret));
  const calendarUnchecked = list.some((b) => b.calendarUnchecked) || !calendarChecked;
  const total = list.reduce((s, b) => s + b.priceCents, 0);
  const n = list.length;
  // A request can mix single blocks and repeats; each series is labelled.
  const seriesLabels = [...new Set(list.map((b) => repeatLabel(b)).filter((x): x is string => Boolean(x)))];
  const allOneSeries = seriesLabels.length === 1 && list.every((b) => b.seriesId && b.seriesId === list[0].seriesId);
  const repeats = allOneSeries ? seriesLabels[0] : null;
  const what = repeats
    ? `${repeats}, ${n} sessions`
    : n === 1
      ? sessionLabel(list[0].startsAt, list[0].endsAt)
      : `${n} sessions${seriesLabels.length ? ' (incl. repeats)' : ''}`;

  const rows = list.map((b) => {
    const clash = reasons.get(b.id);
    const decline =
      n > 1 ? ` · ${emailLink(reviewUrl(signLink({ a: 'decline', b: b.id }, secret)), 'decline just this one')}` : '';
    const rep = !allOneSeries && repeatLabel(b) ? ` · ↻ ${esc(repeatLabel(b)!)}` : '';
    return `<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong> (${lengthLabel(b.startsAt, b.endsAt)}) · ${esc(b.catalogueId)}${paymentsEnabled ? ` · ${money(b.priceCents)}` : ''}${rep}${decline}${
      clash ? `<br><span style="color:${EMAIL_COLORS.red};">Heads up: ${esc(clash.map((r) => REASON_TEXT[r]).join('; '))}.</span>` : ''
    }`;
  });

  const g = gearLine(list[0]);
  const details: Array<[string, string]> = [
    ['Band', esc(band.name)],
    ...(rate ? [['Rate notes', esc(rate)] as [string, string]] : []),
    ...(usual.length ? [['Estimate', esc(usual.join('; '))] as [string, string]] : []),
    ...(band.contactName ? [['Contact', esc(band.contactName)] as [string, string]] : []),
    ['Email', esc(band.email)],
    ...(band.phone ? [['Phone', esc(band.phone)] as [string, string]] : []),
    ['Gear', g ? esc(g) : 'nothing from the house'],
    ...(paymentsEnabled
      ? ([
          ['Pays by', esc(list[0].paymentMethod)],
          ['Total', money(total)],
        ] as Array<[string, string]>)
      : []),
    ['Expires', esc(longDay(list[0].expiresAt))],
  ];

  const html = emailDocument({
    variant: 'admin',
    preheader: `${band.name} asked for ${what}.`,
    body:
      emailP(
        repeats
          ? `${bandHtml} asked for a repeating booking — <strong>${esc(repeats)}</strong>, ${n} session${n === 1 ? '' : 's'}. Approve the series as a whole, or decline single dates:`
          : `${bandHtml} asked for ${n === 1 ? 'a session' : `${n} sessions`}${
              seriesLabels.length ? ` (${seriesLabels.map((l) => esc(l)).join('; ')} — approving approves each series as a whole)` : ''
            }:`,
      ) +
      emailP(rows.join('<br><br>')) +
      (calendarUnchecked
        ? emailP(
            `<strong style="color:${EMAIL_COLORS.red};">Couldn't check your calendar</strong> — a feed didn't load, so busy times weren't taken out. Check your calendar before approving.`,
          )
        : '') +
      (list[0].note ? emailOverline('Their note') + paragraphs(list[0].note) : '') +
      emailDetails(details) +
      emailButton(approveAll, repeats ? `Approve the series (${n})` : n === 1 ? 'Approve' : `Approve all ${n}`) +
      emailP(emailLink(declineAll, n === 1 ? 'Decline' : `Decline all ${n}`)) +
      emailSmall(
        `Both links open a confirm page first and work for 7 days. Or use ${emailLink(`${SITE_URL}/admin/rehearsal/requests`, 'Requests in admin')}.`,
      ),
  });

  const text =
    [
      repeats
        ? `${bandText} asked for a repeating booking — ${repeats}, ${n} sessions. Approve the series, or decline single dates:`
        : `${bandText} asked for ${n === 1 ? 'a session' : `${n} sessions`}${seriesLabels.length ? ` (${seriesLabels.join('; ')})` : ''}:`,
      '',
      ...list.map((b) => {
        const clash = reasons.get(b.id);
        return `- ${sessionLabel(b.startsAt, b.endsAt)} (${lengthLabel(b.startsAt, b.endsAt)}) · ${b.catalogueId}${paymentsEnabled ? ` · ${money(b.priceCents)}` : ''}${
          clash ? `\n  Heads up: ${clash.map((r) => REASON_TEXT[r]).join('; ')}.` : ''
        }${n > 1 ? `\n  Decline just this one: ${reviewUrl(signLink({ a: 'decline', b: b.id }, secret))}` : ''}`;
      }),
      ...(calendarUnchecked ? ['', "COULDN'T CHECK YOUR CALENDAR — a feed didn't load. Check before approving."] : []),
      ...(list[0].note ? ['', 'Their note:', list[0].note] : []),
      '',
      ...details.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')}`),
      '',
      `Approve: ${approveAll}`,
      `Decline: ${declineAll}`,
      '',
      `Links open a confirm page and work for 7 days. Admin: ${SITE_URL}/admin/rehearsal/requests`,
    ].join('\n') + emailTextFooter('admin');

  const ok = await send({
    template: 'rehearsal-request',
    to: ADMIN_TO(),
    subject: `Rehearsal request: ${band.name} · ${what}`,
    html,
    text,
    replyTo: band.email,
  });
  if (ok) await markEmailed(list.map((b) => b.id), 'admin');
  return ok;
}

// --- 2. Approved -> band --------------------------------------------------------

export async function sendApprovedEmail(ids: number[]): Promise<boolean> {
  const list = (await bookingsByIds(ids)).filter((b) => b.status === 'confirmed');
  if (list.length === 0) return false;
  const s = await getRehearsalSettings();
  const band = await bandContact(list[0].bandId);
  const link = await liveLink(list[0].bandId);
  const hi = hey(band.contactName);
  const intro = s.emailApprovedIntro || `You're booked in the basement:`;
  const cancel =
    s.cancellationPolicy ||
    `Can't make it? Cancel on your booking page up to ${s.cancelCutoffHours} hours before, or just let me know.`;

  // One repeating series (payments off): summarise instead of listing every
  // date. "Every Wednesday, 6–9pm, starting Wed 18 Nov" + the next few dates;
  // gear once when it's the same for every session. Single and mixed bookings
  // (and payments on, which needs a pay button per session) list each date.
  const series = !s.paymentsEnabled ? seriesSummary(list) : null;

  const sessionHtml = series
    ? emailP(
        `<strong>${esc(series.headline)}</strong>` +
          (series.next.length ? `<br>Next up: ${esc(series.next.join(', '))}` : '') +
          (series.gear ? `<br>Gear: ${esc(series.gear)}` : ''),
      ) + (series.gearByDate.length ? emailP(series.gearByDate.map((x) => esc(x)).join('<br>')) : '')
    : list
    .map((b) => {
      const g = gearLine(b);
      const memo = venmoMemo(b.catalogueId, band.name);
      return (
        emailP(`<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong>${g ? `<br>Gear: ${esc(g)}` : ''}`) +
        (s.paymentsEnabled
          ? emailButton(venmoPayUrl(s.venmoHandle, b.priceCents, memo), `Pay ${money(b.priceCents)} on Venmo`) +
            emailSmall(`Venmo @${esc(s.venmoHandle)} · $${venmoAmount(b.priceCents)} · memo "${esc(memo)}"`)
          : '')
      );
    })
    .join('');

  const html = bandEmail(
    `You're on: ${list.map((b) => `${shortDay(b.startsAt)} ${timeRange(b.startsAt, b.endsAt)}`).join(', ')}`,
    [
      emailP(esc(hi)),
      paragraphs(intro),
      sessionHtml,
      s.address ? emailP(`<strong>Where:</strong> ${esc(s.address).replace(/\n/g, ', ')}`) : '',
      s.arrivalNotes ? paragraphs(s.arrivalNotes) : '',
      paragraphs(cancel),
      link ? emailP(`${emailLink(link, 'Your booking page')} · calendar file attached.`) : emailP('Calendar file attached.'),
    ],
  );
  const text =
    [
      hi,
      '',
      intro,
      '',
      ...(series
        ? [
            series.headline,
            ...(series.next.length ? [`Next up: ${series.next.join(', ')}`] : []),
            ...(series.gear ? [`Gear: ${series.gear}`] : []),
            ...series.gearByDate,
            '',
          ]
        : []),
      ...(series ? [] : list).flatMap((b) => {
        const g = gearLine(b);
        const memo = venmoMemo(b.catalogueId, band.name);
        return [
          sessionLabel(b.startsAt, b.endsAt),
          ...(g ? [`Gear: ${g}`] : []),
          ...(s.paymentsEnabled ? [`Venmo @${s.venmoHandle} · $${venmoAmount(b.priceCents)} · memo "${memo}": ${venmoPayUrl(s.venmoHandle, b.priceCents, memo)}`] : []),
          '',
        ];
      }),
      ...(s.address ? [`Where: ${s.address.replace(/\n/g, ', ')}`] : []),
      ...(s.arrivalNotes ? [s.arrivalNotes] : []),
      '',
      cancel,
      ...(link ? ['', `Your booking page: ${link}`] : []),
      '',
      SIGN,
    ].join('\n') + emailTextFooter();

  const ics = buildIcs(
    list.map((b) => ({
      uid: `${b.catalogueId.toLowerCase()}@thebirdhaus.org`,
      start: b.startsAt,
      end: b.endsAt,
      summary: 'Rehearsal at the BIRDHAUS',
      location: s.address.replace(/\s*\n\s*/g, ', ') || undefined,
      // Arrival notes only: calendar events get shared more casually than email,
      // so the private booking link stays in the email body.
      description: s.arrivalNotes || undefined,
    })),
    { name: 'the BIRDHAUS rehearsal' },
  );

  const ok = await send({
    template: 'rehearsal-approved',
    to: band.email,
    subject:
      list.length === 1
        ? `You're on: ${shortDay(list[0].startsAt)}, ${timeRange(list[0].startsAt, list[0].endsAt)}`
        : `You're on: ${list.length} rehearsals at the BIRDHAUS`,
    html,
    text,
    replyTo: REPLY_TO,
    attachments: [
      { filename: 'birdhaus-rehearsal.ics', content: Buffer.from(ics).toString('base64'), contentType: 'text/calendar' },
    ],
  });
  if (ok) await markEmailed(list.map((b) => b.id), 'band');
  return ok;
}

// --- 3. Declined -> band ----------------------------------------------------------

export async function sendDeclinedEmail(ids: number[], reason: string): Promise<boolean> {
  const list = (await bookingsByIds(ids)).filter((b) => b.status === 'declined');
  if (list.length === 0) return false;
  const s = await getRehearsalSettings();
  const band = await bandContact(list[0].bandId);
  const link = await liveLink(list[0].bandId);
  const hi = hey(band.contactName);
  const when = list.map((b) => sessionLabel(b.startsAt, b.endsAt));
  const sorry = s.emailDeclinedIntro || `Sorry, I can't do ${list.length === 1 ? 'this one' : 'these'}:`;
  const next = link ? "Grab another time on your booking page, or reply and we'll figure something out." : "Reply and we'll figure something out.";

  const html = bandEmail('About your rehearsal request', [
    emailP(esc(hi)),
    paragraphs(sorry),
    emailP(when.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')),
    reason.trim() ? paragraphs(reason.trim()) : '',
    link ? emailP(`${emailLink(link, 'Grab another time')}, or reply and we'll figure something out.`) : emailP(esc(next)),
  ]);
  const text =
    [hi, '', sorry, ...when, ...(reason.trim() ? ['', reason.trim()] : []), '', next, ...(link ? [link] : []), '', SIGN].join('\n') +
    emailTextFooter();

  const ok = await send({ template: 'rehearsal-declined', to: band.email, subject: 'About your rehearsal request', html, text, replyTo: REPLY_TO });
  if (ok) await markEmailed(list.map((b) => b.id), 'band');
  return ok;
}

// --- 4. Band cancelled -> Alex ------------------------------------------------------

export async function sendBandCancelledEmail(id: number): Promise<boolean> {
  const [b] = await bookingsByIds([id]);
  if (!b || b.status !== 'cancelled') return false;
  const html = emailDocument({
    variant: 'admin',
    preheader: `${b.bandName} cancelled ${b.catalogueId}`,
    body:
      emailP(
        `<strong>${esc(b.bandName)}</strong> cancelled <strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong> (${esc(b.catalogueId)}) from their booking page. The block is open again.`,
      ) + emailP(emailLink(`${SITE_URL}/admin/rehearsal/requests`, 'Requests in admin')),
  });
  const text =
    `${b.bandName} cancelled ${sessionLabel(b.startsAt, b.endsAt)} (${b.catalogueId}) from their booking page. The block is open again.\n\n${SITE_URL}/admin/rehearsal/requests` +
    emailTextFooter('admin');
  return send({
    template: 'rehearsal-band-cancelled',
    to: ADMIN_TO(),
    subject: `Rehearsal cancelled: ${b.bandName} · ${shortDay(b.startsAt)}`,
    html,
    text,
    replyTo: b.bandEmail,
  });
}

// --- 5. Request lapsed -> band (daily job) ----------------------------------------

export async function sendExpiredEmail(ids: number[]): Promise<boolean> {
  const list = (await bookingsByIds(ids)).filter((b) => b.status === 'expired');
  if (list.length === 0) return false;
  const band = await bandContact(list[0].bandId);
  const link = await liveLink(list[0].bandId);
  const hi = hey(band.contactName);
  const when = list.map((b) => sessionLabel(b.startsAt, b.endsAt));
  const sorry = `Sorry — I didn't get back to you in time on ${list.length === 1 ? 'this one' : 'these'}, so ${list.length === 1 ? 'it' : 'they'} lapsed:`;
  const html = bandEmail('Your rehearsal request lapsed', [
    emailP(esc(hi)),
    emailP(esc(sorry)),
    emailP(when.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')),
    link ? emailP(`Still want it? ${emailLink(link, 'Send it again')} and I'll be quicker.`) : emailP('Still want it? Just reply.'),
  ]);
  const text =
    [hi, '', sorry, ...when, '', link ? `Still want it? Send it again: ${link}` : 'Still want it? Just reply.', '', SIGN].join('\n') +
    emailTextFooter();
  const ok = await send({ template: 'rehearsal-expired', to: band.email, subject: 'Your rehearsal request lapsed', html, text, replyTo: REPLY_TO });
  if (ok) await sql`update rehearsal_bookings set expiry_notified_at = now() where id in ${sql(list.map((b) => b.id))}`;
  return ok;
}

// --- 6. Day-before reminder -> band (daily job) -------------------------------------

export async function sendReminderEmail(ids: number[]): Promise<boolean> {
  const list = (await bookingsByIds(ids)).filter((b) => b.status === 'confirmed');
  if (list.length === 0) return false;
  const s = await getRehearsalSettings();
  const band = await bandContact(list[0].bandId);
  const link = await liveLink(list[0].bandId);
  const hi = hey(band.contactName);
  const intro = s.emailReminderIntro || 'See you tomorrow:';
  const sessions = list.map((b) => {
    const g = gearLine(b);
    const memo = venmoMemo(b.catalogueId, band.name);
    const pay = s.paymentsEnabled && b.paymentStatus === 'unpaid';
    return {
      html:
        emailP(`<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong>${g ? `<br>I'll have out: ${esc(g)}` : ''}`) +
        (pay
          ? emailButton(venmoPayUrl(s.venmoHandle, b.priceCents, memo), `Pay ${money(b.priceCents)} on Venmo`)
          : ''),
      text: [sessionLabel(b.startsAt, b.endsAt), ...(g ? [`I'll have out: ${g}`] : []), ...(pay ? [`Venmo: ${venmoPayUrl(s.venmoHandle, b.priceCents, memo)}`] : [])],
    };
  });
  const html = bandEmail(`Tomorrow: ${list.map((b) => timeRange(b.startsAt, b.endsAt)).join(', ')}`, [
    emailP(esc(hi)),
    paragraphs(intro),
    sessions.map((x) => x.html).join(''),
    s.address ? emailP(`<strong>Where:</strong> ${esc(s.address).replace(/\n/g, ', ')}`) : '',
    s.arrivalNotes ? paragraphs(s.arrivalNotes) : '',
    emailP(link ? `Can't make it? ${emailLink(link, 'Cancel here')} or just let me know.` : "Can't make it? Just let me know."),
  ]);
  const text =
    [
      hi,
      '',
      intro,
      ...sessions.flatMap((x) => x.text),
      '',
      ...(s.address ? [`Where: ${s.address.replace(/\n/g, ', ')}`] : []),
      ...(s.arrivalNotes ? [s.arrivalNotes] : []),
      '',
      link ? `Can't make it? Cancel here: ${link} or just let me know.` : "Can't make it? Just let me know.",
      '',
      SIGN,
    ].join('\n') + emailTextFooter();
  const ok = await send({
    template: 'rehearsal-reminder',
    to: band.email,
    subject: `Tomorrow: rehearsal ${timeRange(list[0].startsAt, list[0].endsAt)}`,
    html,
    text,
    replyTo: REPLY_TO,
  });
  if (ok) await sql`update rehearsal_bookings set reminder_sent_at = now() where id in ${sql(list.map((b) => b.id))}`;
  return ok;
}

// --- 7. Alex's morning email (daily job) ----------------------------------------------

export interface MorningData {
  today: AdminBooking[];
  tomorrow: AdminBooking[];
  newConflicts: Array<{ booking: AdminBooking; reasons: Reason[] }>;
  expired: number;
  outstandingCents: number;
  paymentsEnabled: boolean;
  // Rate card + flags for the soft usual-rate beside each session.
  rates: RateCardInput & { paymentsEnabled: boolean; estimatesEnabled: boolean };
  // Repeating bookings extended this morning.
  seriesBooked: Array<{ bandName: string; start: Date; end: Date; catalogueId: string }>;
  seriesSkipped: Array<{ bandName: string; start: Date; end: Date }>;
  calendarChecked: boolean;
}

function sessionLine(b: AdminBooking, d: MorningData): string {
  const g = gearLine(b);
  const pay = !d.paymentsEnabled ? '' : ` · ${b.paymentStatus === 'unpaid' ? `unpaid (${b.paymentMethod})` : b.paymentStatus}`;
  const usual = usualRateFor(b.startsAt, b.endsAt, b.seriesFreq, d.rates);
  const notes = [b.rateNotes, usual && usual.replace(/^Usual rate for .*?: /, 'usual ').replace(/^Regular rate: /, 'regular ')]
    .filter(Boolean)
    .join('; ');
  return `${timeRange(b.startsAt, b.endsAt)} (${lengthLabel(b.startsAt, b.endsAt)}) · ${b.bandName}${notes ? ` (${notes})` : ''} · ${b.catalogueId} · gear: ${g || 'none'}${pay}${
    b.conflict ? ' · CONFLICT' : ''
  }`;
}

export async function sendMorningEmail(d: MorningData): Promise<boolean> {
  const sec = (title: string, rows: string[]) =>
    rows.length ? emailOverline(title) + emailP(rows.map((r) => esc(r)).join('<br>')) : '';
  const conflictRows = d.newConflicts.map(
    (c) =>
      `${sessionLabel(c.booking.startsAt, c.booking.endsAt)} · ${c.booking.bandName} (${c.booking.catalogueId}): ${c.reasons
        .map((r) => REASON_TEXT[r])
        .join('; ')}`,
  );
  const html = emailDocument({
    variant: 'admin',
    preheader: `${d.today.length} today · ${d.tomorrow.length} tomorrow${d.newConflicts.length ? ` · ${d.newConflicts.length} conflict` : ''}`,
    body:
      (d.newConflicts.length
        ? emailOverline('New conflicts — nothing was cancelled') +
          emailP(conflictRows.map((r) => `<span style="color:${EMAIL_COLORS.red};">${esc(r)}</span>`).join('<br>')) +
          emailSmall('Get in touch with the band, then keep or cancel it in admin.')
        : '') +
      sec('Today', d.today.map((b) => sessionLine(b, d))) +
      (d.today.length ? '' : emailP('No rehearsals today.')) +
      sec('Tomorrow', d.tomorrow.map((b) => sessionLine(b, d))) +
      sec(
        'Added to repeating bookings',
        d.seriesBooked.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName} · ${x.catalogueId}`),
      ) +
      sec(
        'Skipped in repeating bookings (band told)',
        d.seriesSkipped.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName}`),
      ) +
      (d.expired ? emailP(`${d.expired} request${d.expired === 1 ? '' : 's'} lapsed; the bands were told.`) : '') +
      (d.paymentsEnabled && d.outstandingCents ? emailP(`Outstanding: ${money(d.outstandingCents)}.`) : '') +
      (d.calendarChecked
        ? ''
        : emailP(`<strong>Couldn't read your calendar this morning</strong> — busy-time conflicts weren't checked.`)) +
      emailP(emailLink(`${SITE_URL}/admin/rehearsal/calendar`, 'Rehearsal calendar')),
  });
  const text =
    [
      ...(d.newConflicts.length ? ['NEW CONFLICTS — nothing was cancelled', ...conflictRows, ''] : []),
      'TODAY',
      ...(d.today.length ? d.today.map((b) => sessionLine(b, d)) : ['No rehearsals today.']),
      '',
      ...(d.tomorrow.length ? ['TOMORROW', ...d.tomorrow.map((b) => sessionLine(b, d)), ''] : []),
      ...(d.seriesBooked.length
        ? ['ADDED TO REPEATING BOOKINGS', ...d.seriesBooked.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName} · ${x.catalogueId}`), '']
        : []),
      ...(d.seriesSkipped.length
        ? ['SKIPPED IN REPEATING BOOKINGS (band told)', ...d.seriesSkipped.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName}`), '']
        : []),
      ...(d.expired ? [`${d.expired} request(s) lapsed; the bands were told.`] : []),
      ...(d.paymentsEnabled && d.outstandingCents ? [`Outstanding: ${money(d.outstandingCents)}`] : []),
      ...(d.calendarChecked ? [] : ["Couldn't read your calendar this morning."]),
      '',
      `${SITE_URL}/admin/rehearsal/calendar`,
    ].join('\n') + emailTextFooter('admin');
  const n = d.newConflicts.length;
  const ok = await send({
    template: 'rehearsal-morning',
    to: ADMIN_TO(),
    subject: `Rehearsals: ${d.today.length} today, ${d.tomorrow.length} tomorrow${n ? ` · ${n} conflict${n === 1 ? '' : 's'}` : ''}`,
    html,
    text,
  });
  if (ok && n) {
    await sql`update rehearsal_bookings set conflict_notified_at = now() where id in ${sql(d.newConflicts.map((c) => c.booking.id))}`;
  }
  return ok;
}

// --- 8. Series dates skipped -> band (daily job) -------------------------------------

export async function sendSeriesSkipEmail(bandId: number, sessions: Array<{ start: Date; end: Date }>): Promise<boolean> {
  if (sessions.length === 0) return false;
  const band = await bandContact(bandId);
  const link = await liveLink(bandId);
  const hi = hey(band.contactName);
  const when = sessions.map((x) => sessionLabel(x.start, x.end));
  // Date first: "Heads up: Wednesday 2 December, 6–9pm is off — …"
  const one = when.length === 1;
  const lead = one ? `Heads up: ${when[0]} is off` : 'Heads up: these are off';
  const tail = ` — the basement's not free ${one ? 'that night' : 'those nights'}. Everything else stays the same.`;
  const html = bandEmail('A rehearsal date is skipped', [
    emailP(esc(hi)),
    one
      ? emailP(`Heads up: <strong>${esc(when[0])}</strong> is off${esc(tail)}`)
      : emailP(esc(`${lead}${tail}`)) + emailP(when.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')),
    link ? emailP(`Want another time that week? ${emailLink(link, 'Grab one here')}.`) : '',
  ]);
  const text =
    [hi, '', `${lead}${tail}`, ...(one ? [] : when), ...(link ? ['', `Want another time that week? ${link}`] : []), '', SIGN].join('\n') +
    emailTextFooter();
  return send({
    template: 'rehearsal-series-skipped',
    to: band.email,
    subject: when.length === 1 ? `Skipped: ${when[0]}` : `${when.length} rehearsal dates skipped`,
    html,
    text,
    replyTo: REPLY_TO,
  });
}

// --- 9. Series ended -> the other side ---------------------------------------------------

export async function sendSeriesEndedEmail(seriesId: number, by: 'band' | 'admin', cancelled: number): Promise<boolean> {
  const [s] = await sql<{ bandId: number; freq: string; endsOn: string; anchor: Date | null }[]>`
    select band_id::int as "bandId", freq, ends_on::text as "endsOn", anchor_starts_at as anchor
    from rehearsal_series where id = ${seriesId}
  `;
  if (!s) return false;
  const band = await bandContact(s.bandId);
  const [ey, em, ed] = s.endsOn.split('-').map(Number);
  const from = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(ey, em - 1, ed, 12)),
  );
  const what = s.anchor ? describeRule(chicagoDate(s.anchor), s.freq as Freq) : 'repeating booking';
  if (by === 'band') {
    const body = `${band.name} ended their repeating booking (${what}) from ${from}: ${cancelled} session${cancelled === 1 ? '' : 's'} cancelled, the blocks are open again.`;
    return send({
      template: 'rehearsal-series-ended-by-band',
      to: ADMIN_TO(),
      subject: `Repeating booking ended: ${band.name}`,
      html: emailDocument({ variant: 'admin', preheader: body, body: emailP(esc(body)) + emailP(emailLink(`${SITE_URL}/admin/rehearsal/bands/${s.bandId}`, 'Band page')) }),
      text: `${body}\n\n${SITE_URL}/admin/rehearsal/bands/${s.bandId}` + emailTextFooter('admin'),
      replyTo: band.email,
    });
  }
  const hi = hey(band.contactName);
  // "your regular Wednesday slot" / "your every-other-Wednesday slot" / "your monthly slot"
  const weekday = s.anchor
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/Chicago' }).format(s.anchor)
    : '';
  const slot =
    s.freq === 'weekly' && weekday
      ? `your regular ${weekday} slot`
      : s.freq === 'biweekly' && weekday
        ? `your every-other-${weekday} slot`
        : 'your monthly slot';
  void what;
  const body = `I've stopped ${slot} from ${from}${
    cancelled ? ` — ${cancelled === 1 ? "that session's" : `those ${cancelled} sessions are`} off` : ''
  }. Anything before that stays as it is. Shout if that's a surprise.`;
  const link = await liveLink(s.bandId);
  return send({
    template: 'rehearsal-series-ended-by-admin',
    to: band.email,
    subject: 'Your regular rehearsal slot has ended',
    html: bandEmail('Your regular slot has ended', [
      emailP(esc(hi)),
      emailP(esc(body)),
      link ? emailP(`Your booking page: ${emailLink(link, link.replace(/^https?:\/\//, ''))}`) : '',
    ]),
    text: [hi, '', body, ...(link ? ['', `Your booking page: ${link}`] : []), '', SIGN].join('\n') + emailTextFooter(),
    replyTo: REPLY_TO,
  });
}

// --- 10. New lead -> Alex; auto-reply -> them --------------------------------------

export async function sendLeadEmails(leadId: number): Promise<void> {
  const l = await getLead(leadId);
  if (!l) return;
  const s = await getRehearsalSettings();
  const who = l.project ? `${l.project} (${l.name})` : l.name;
  const rows: Array<[string, string]> = [
    ['Name', esc(l.name)],
    ...(l.project ? [['Band', esc(l.project)] as [string, string]] : []),
    ['Email', esc(l.email)],
    ...(l.phone ? [['Phone', esc(l.phone)] as [string, string]] : []),
    ...(l.people ? [['People', String(l.people)] as [string, string]] : []),
    ['How often', esc(FREQUENCY_LABEL[l.frequency] ?? l.frequency)],
    ...(l.preferredTimes ? [['Prefers', esc(l.preferredTimes)] as [string, string]] : []),
    ...(l.genreLinks ? [['Genre / links', esc(l.genreLinks)] as [string, string]] : []),
  ];
  await send({
    template: 'rehearsal-lead',
    to: ADMIN_TO(),
    subject: `Rehearsal interest: ${who}`,
    html: emailDocument({
      variant: 'admin',
      preheader: `${who} wants to rehearse`,
      body:
        emailP(`<strong>${esc(who)}</strong> filled in the rehearsal interest form.`) +
        emailDetails(rows) +
        (l.notes ? emailOverline('Notes') + paragraphs(l.notes) : '') +
        emailButton(`${SITE_URL}/admin/rehearsal/leads`, 'Invite or archive in Leads'),
    }),
    text:
      [`${who} filled in the rehearsal interest form.`, '', `Email: ${l.email}`, leadSummary(l), '', `${SITE_URL}/admin/rehearsal/leads`].join('\n') +
      emailTextFooter('admin'),
    replyTo: l.email,
  });

  const hi = hey(l.name);
  const body =
    s.emailLeadAutoreply ||
    "Thanks for reaching out about the rehearsal space! I'll read this and get back to you soon — if it's a fit, I'll send you a link to book.";
  await send({
    template: 'rehearsal-lead-autoreply',
    to: l.email,
    subject: 'Got it — the BIRDHAUS rehearsal space',
    html: bandEmail('Got your note about the rehearsal space', [emailP(esc(hi)), paragraphs(body)]),
    text: [hi, '', body, '', SIGN].join('\n') + emailTextFooter(),
    replyTo: REPLY_TO,
  });
}

// --- 11. Invite -> band: their private booking link ------------------------------------

export async function sendInviteEmail(bandId: number): Promise<boolean> {
  const band = await bandContact(bandId);
  const link = await liveLink(bandId);
  if (!band || !link) return false;
  const s = await getRehearsalSettings();
  const hi = hey(band.contactName);
  const how = `Tap a day, pick a start time and how long — once or repeating — and send it. I'll confirm by email with the address.${
    s.paymentsEnabled
      ? ` It's ${money(s.priceCents)} a session${s.repeatPriceCents !== null && s.repeatPriceCents !== s.priceCents ? ` (${money(s.repeatPriceCents)} when it repeats)` : ''}, by Venmo.`
      : ''
  }`;
  // The informal rate card (payments off): display only.
  const card = s.paymentsEnabled ? [] : rateCardLines(s);
  const cardText = [...(card.length ? [`Rates: ${card.join(' · ')}.`] : []), s.paymentsEnabled ? '' : s.rateRegularText, s.paymentsEnabled ? '' : s.rateFlexibleText].filter(Boolean);
  const ok = await send({
    template: 'rehearsal-invite',
    to: band.email,
    subject: 'Your link to book the basement',
    html: bandEmail('Your link to book the basement', [
      emailP(esc(hi)),
      emailP("Here's your link to book the basement:"),
      emailButton(link, 'Book a time'),
      emailP(esc(how)),
      ...cardText.map((t) => emailP(esc(t))),
      emailSmall('This link is private and specific to you.'),
    ]),
    text:
      [hi, '', "Here's your link to book the basement:", link, '', how, '', ...cardText.flatMap((t) => [t, '']), 'This link is private and specific to you.', '', SIGN].join('\n') +
      emailTextFooter(),
    replyTo: REPLY_TO,
  });
  return ok;
}
