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

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => emailP(esc(p.trim()).replace(/\n/g, '<br>')))
    .join('');
}

const reviewUrl = (token: string) => `${SITE_URL}/rehearsal/review/${token}`;

// --- 1. New request -> Alex ---------------------------------------------------

export async function sendRequestEmail(requestKey: string): Promise<boolean> {
  const list = (await bookingsByRequest(requestKey)).filter((b) => b.status === 'pending');
  if (list.length === 0) return false;
  const band = await bandContact(list[0].bandId);
  const { reasons, calendarChecked } = await clashesFor(list);
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
    return `<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong> · ${esc(b.catalogueId)} · ${money(b.priceCents)}${rep}${decline}${
      clash ? `<br><span style="color:${EMAIL_COLORS.red};">Heads up: ${esc(clash.map((r) => REASON_TEXT[r]).join('; '))}.</span>` : ''
    }`;
  });

  const g = gearLine(list[0]);
  const details: Array<[string, string]> = [
    ['Band', esc(band.name)],
    ...(band.contactName ? [['Contact', esc(band.contactName)] as [string, string]] : []),
    ['Email', esc(band.email)],
    ...(band.phone ? [['Phone', esc(band.phone)] as [string, string]] : []),
    ['Gear', g ? esc(g) : 'nothing from the house'],
    ['Pays by', esc(list[0].paymentMethod)],
    ['Total', money(total)],
    ['Expires', esc(longDay(list[0].expiresAt))],
  ];

  const html = emailDocument({
    variant: 'admin',
    preheader: `${band.name} asked for ${what}.`,
    body:
      emailP(
        repeats
          ? `<strong>${esc(band.name)}</strong> asked for a repeating booking — <strong>${esc(repeats)}</strong>, ${n} session${n === 1 ? '' : 's'}. Approve the series as a whole, or decline single dates:`
          : `<strong>${esc(band.name)}</strong> asked for ${n === 1 ? 'a block' : `${n} sessions`}${
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
        ? `${band.name} asked for a repeating booking — ${repeats}, ${n} sessions. Approve the series, or decline single dates:`
        : `${band.name} asked for ${n === 1 ? 'a block' : `${n} sessions`}${seriesLabels.length ? ` (${seriesLabels.join('; ')})` : ''}:`,
      '',
      ...list.map((b) => {
        const clash = reasons.get(b.id);
        return `- ${sessionLabel(b.startsAt, b.endsAt)} · ${b.catalogueId} · ${money(b.priceCents)}${
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const intro =
    s.emailApprovedIntro ||
    `You're booked at the BIRDHAUS rehearsal space. Here are the details — save the attached calendar file so it's in your phone.`;
  const policy =
    s.cancellationPolicy ||
    `Plans change — you can cancel on your booking page up to ${s.cancelCutoffHours} hours before a session. After that, just email me.`;

  const sessionsHtml = list
    .map((b) => {
      const memo = venmoMemo(b.catalogueId, band.name);
      const pay = venmoPayUrl(s.venmoHandle, b.priceCents, memo);
      const g = gearLine(b);
      return (
        emailP(
          `<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong><br>${esc(b.catalogueId)} · ${money(b.priceCents)}${
            g ? `<br>Gear you asked for: ${esc(g)}` : ''
          }`,
        ) +
        emailButton(pay, `Pay ${money(b.priceCents)} on Venmo`) +
        emailSmall(
          `If the link doesn't fill in: Venmo <strong>@${esc(s.venmoHandle)}</strong> · $${venmoAmount(b.priceCents)} · memo “${esc(memo)}”`,
        )
      );
    })
    .join('');

  const html = emailDocument({
    preheader: `Confirmed: ${list.map((b) => `${shortDay(b.startsAt)} ${timeRange(b.startsAt, b.endsAt)}`).join(', ')}`,
    body:
      emailP(esc(hello)) +
      paragraphs(intro) +
      sessionsHtml +
      (s.address ? emailOverline('Where') + paragraphs(s.address) : '') +
      (s.arrivalNotes ? emailOverline('Getting in') + paragraphs(s.arrivalNotes) : '') +
      emailOverline('Paying') +
      emailP(
        `Pay per session by Venmo — before or right after you play is great. Please keep the memo as it is so I can match it up.`,
      ) +
      emailOverline('Cancelling') +
      paragraphs(policy) +
      (link ? emailP(emailLink(link, 'Your booking page')) : '') +
      emailP('alex / the BIRDHAUS'),
  });

  const text =
    [
      hello,
      '',
      intro,
      '',
      ...list.flatMap((b) => {
        const memo = venmoMemo(b.catalogueId, band.name);
        const g = gearLine(b);
        return [
          `${sessionLabel(b.startsAt, b.endsAt)} · ${b.catalogueId} · ${money(b.priceCents)}`,
          ...(g ? [`Gear you asked for: ${g}`] : []),
          `Pay on Venmo: ${venmoPayUrl(s.venmoHandle, b.priceCents, memo)}`,
          `(or Venmo @${s.venmoHandle} · $${venmoAmount(b.priceCents)} · memo "${memo}")`,
          '',
        ];
      }),
      ...(s.address ? ['WHERE', s.address, ''] : []),
      ...(s.arrivalNotes ? ['GETTING IN', s.arrivalNotes, ''] : []),
      'CANCELLING',
      policy,
      ...(link ? ['', `Your booking page: ${link}`] : []),
      '',
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();

  const ics = buildIcs(
    list.map((b) => ({
      uid: `${b.catalogueId.toLowerCase()}@thebirdhaus.org`,
      start: b.startsAt,
      end: b.endsAt,
      summary: `Rehearsal at the BIRDHAUS (${b.catalogueId})`,
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
        ? `Confirmed: rehearsal ${shortDay(list[0].startsAt)}, ${timeRange(list[0].startsAt, list[0].endsAt)}`
        : `Confirmed: ${list.length} rehearsals at the BIRDHAUS`,
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const intro =
    s.emailDeclinedIntro ||
    `Thanks so much for asking — I'm sorry, but I can't host you for ${list.length === 1 ? 'this one' : 'these'}:`;
  const sessions = list.map((b) => sessionLabel(b.startsAt, b.endsAt));

  const html = emailDocument({
    preheader: `About your rehearsal request`,
    body:
      emailP(esc(hello)) +
      paragraphs(intro) +
      emailP(sessions.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')) +
      (reason.trim() ? paragraphs(reason.trim()) : '') +
      (link
        ? emailP(`Other times might work — ${emailLink(link, 'pick another block')} whenever you like.`)
        : emailP('Other times might work — just reply and we can sort something out.')) +
      emailP('alex / the BIRDHAUS'),
  });
  const text =
    [
      hello,
      '',
      intro,
      ...sessions.map((x) => `- ${x}`),
      ...(reason.trim() ? ['', reason.trim()] : []),
      '',
      link ? `Other times might work — pick another block: ${link}` : 'Other times might work — just reply.',
      '',
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();

  const ok = await send({
    template: 'rehearsal-declined',
    to: band.email,
    subject: 'About your rehearsal request',
    html,
    text,
    replyTo: REPLY_TO,
  });
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const sessions = list.map((b) => sessionLabel(b.startsAt, b.endsAt));
  const intro = `Sorry — I didn't get to your rehearsal request in time, so it lapsed and those times are open again:`;
  const html = emailDocument({
    preheader: 'Your rehearsal request lapsed',
    body:
      emailP(esc(hello)) +
      emailP(esc(intro)) +
      emailP(sessions.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')) +
      (link
        ? emailP(`If you still want them, ${emailLink(link, 'send the request again')} and I'll answer quicker.`)
        : emailP('If you still want them, just reply.')) +
      emailP('alex / the BIRDHAUS'),
  });
  const text =
    [
      hello,
      '',
      intro,
      ...sessions.map((x) => `- ${x}`),
      '',
      link ? `Send it again: ${link}` : 'Just reply if you still want them.',
      '',
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();
  const ok = await send({
    template: 'rehearsal-expired',
    to: band.email,
    subject: 'Your rehearsal request lapsed',
    html,
    text,
    replyTo: REPLY_TO,
  });
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const intro = s.emailReminderIntro || 'See you tomorrow at the BIRDHAUS rehearsal space!';
  const blocks = list.map((b) => {
    const memo = venmoMemo(b.catalogueId, band.name);
    const g = gearLine(b);
    const unpaid = b.paymentStatus === 'unpaid';
    return {
      html:
        emailP(
          `<strong>${esc(sessionLabel(b.startsAt, b.endsAt))}</strong><br>${esc(b.catalogueId)}${
            g ? `<br>Gear set up for you: ${esc(g)}` : ''
          }`,
        ) +
        (unpaid
          ? emailButton(venmoPayUrl(s.venmoHandle, b.priceCents, memo), `Pay ${money(b.priceCents)} on Venmo`) +
            emailSmall(`Venmo <strong>@${esc(s.venmoHandle)}</strong> · $${venmoAmount(b.priceCents)} · memo “${esc(memo)}”`)
          : ''),
      text: [
        `${sessionLabel(b.startsAt, b.endsAt)} · ${b.catalogueId}`,
        ...(g ? [`Gear set up for you: ${g}`] : []),
        ...(unpaid ? [`Pay on Venmo: ${venmoPayUrl(s.venmoHandle, b.priceCents, memo)}`] : []),
        '',
      ],
    };
  });
  const html = emailDocument({
    preheader: `Tomorrow: ${list.map((b) => timeRange(b.startsAt, b.endsAt)).join(', ')}`,
    body:
      emailP(esc(hello)) +
      paragraphs(intro) +
      blocks.map((x) => x.html).join('') +
      (s.address ? emailOverline('Where') + paragraphs(s.address) : '') +
      (s.arrivalNotes ? emailOverline('Getting in') + paragraphs(s.arrivalNotes) : '') +
      (link ? emailP(`Can't make it? Use ${emailLink(link, 'your booking page')}, or just reply.`) : '') +
      emailP('alex / the BIRDHAUS'),
  });
  const text =
    [
      hello,
      '',
      intro,
      '',
      ...blocks.flatMap((x) => x.text),
      ...(s.address ? ['WHERE', s.address, ''] : []),
      ...(s.arrivalNotes ? ['GETTING IN', s.arrivalNotes, ''] : []),
      ...(link ? [`Your booking page: ${link}`, ''] : []),
      'alex / the BIRDHAUS',
    ].join('\n') + emailTextFooter();
  const ok = await send({
    template: 'rehearsal-reminder',
    to: band.email,
    subject: `Tomorrow: rehearsal ${timeRange(list[0].startsAt, list[0].endsAt)} at the BIRDHAUS`,
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
  // Repeating bookings extended this morning.
  seriesBooked: Array<{ bandName: string; start: Date; end: Date; catalogueId: string }>;
  seriesSkipped: Array<{ bandName: string; start: Date; end: Date }>;
  calendarChecked: boolean;
}

function sessionLine(b: AdminBooking): string {
  const g = gearLine(b);
  const pay = b.paymentStatus === 'unpaid' ? `unpaid (${b.paymentMethod})` : b.paymentStatus;
  return `${timeRange(b.startsAt, b.endsAt)} · ${b.bandName} · ${b.catalogueId} · gear: ${g || 'none'} · ${pay}${
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
      sec('Today', d.today.map(sessionLine)) +
      (d.today.length ? '' : emailP('No rehearsals today.')) +
      sec('Tomorrow', d.tomorrow.map(sessionLine)) +
      sec(
        'Added to repeating bookings',
        d.seriesBooked.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName} · ${x.catalogueId}`),
      ) +
      sec(
        'Skipped in repeating bookings (band told)',
        d.seriesSkipped.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName}`),
      ) +
      (d.expired ? emailP(`${d.expired} request${d.expired === 1 ? '' : 's'} lapsed; the bands were told.`) : '') +
      (d.outstandingCents ? emailP(`Outstanding: ${money(d.outstandingCents)}.`) : '') +
      (d.calendarChecked
        ? ''
        : emailP(`<strong>Couldn't read your calendar this morning</strong> — busy-time conflicts weren't checked.`)) +
      emailP(emailLink(`${SITE_URL}/admin/rehearsal/calendar`, 'Rehearsal calendar')),
  });
  const text =
    [
      ...(d.newConflicts.length ? ['NEW CONFLICTS — nothing was cancelled', ...conflictRows, ''] : []),
      'TODAY',
      ...(d.today.length ? d.today.map(sessionLine) : ['No rehearsals today.']),
      '',
      ...(d.tomorrow.length ? ['TOMORROW', ...d.tomorrow.map(sessionLine), ''] : []),
      ...(d.seriesBooked.length
        ? ['ADDED TO REPEATING BOOKINGS', ...d.seriesBooked.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName} · ${x.catalogueId}`), '']
        : []),
      ...(d.seriesSkipped.length
        ? ['SKIPPED IN REPEATING BOOKINGS (band told)', ...d.seriesSkipped.map((x) => `${sessionLabel(x.start, x.end)} · ${x.bandName}`), '']
        : []),
      ...(d.expired ? [`${d.expired} request(s) lapsed; the bands were told.`] : []),
      ...(d.outstandingCents ? [`Outstanding: ${money(d.outstandingCents)}`] : []),
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const lines = sessions.map((x) => sessionLabel(x.start, x.end));
  const intro = `Heads up — the rehearsal space isn't free for ${lines.length === 1 ? 'this date' : 'these dates'} in your repeating booking, so ${lines.length === 1 ? "it's" : "they're"} skipped:`;
  const rest = 'The rest of your repeating booking is unchanged.';
  const html = emailDocument({
    preheader: 'A date in your repeating booking is skipped',
    body:
      emailP(esc(hello)) +
      emailP(esc(intro)) +
      emailP(lines.map((x) => `<strong>${esc(x)}</strong>`).join('<br>')) +
      emailP(esc(rest)) +
      (link ? emailP(`Want another time that week? ${emailLink(link, 'Pick one here')}.`) : '') +
      emailP('alex / the BIRDHAUS'),
  });
  const text =
    [hello, '', intro, ...lines.map((x) => `- ${x}`), '', rest, ...(link ? ['', `Pick another time: ${link}`] : []), '', 'alex / the BIRDHAUS'].join('\n') +
    emailTextFooter();
  return send({
    template: 'rehearsal-series-skipped',
    to: band.email,
    subject: lines.length === 1 ? `Skipped: rehearsal ${lines[0]}` : `${lines.length} rehearsal dates skipped`,
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
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const body = `I've ended your repeating booking (${what}) from ${from}${cancelled ? ` — ${cancelled} session${cancelled === 1 ? '' : 's'} from then on ${cancelled === 1 ? 'is' : 'are'} cancelled` : ''}. Sessions before that stay as they are. Reply if anything's unclear.`;
  const link = await liveLink(s.bandId);
  return send({
    template: 'rehearsal-series-ended-by-admin',
    to: band.email,
    subject: 'Your repeating rehearsal booking has ended',
    html: emailDocument({
      preheader: 'Your repeating booking has ended',
      body: emailP(esc(hello)) + emailP(esc(body)) + (link ? emailP(emailLink(link, 'Your booking page')) : '') + emailP('alex / the BIRDHAUS'),
    }),
    text: [hello, '', body, ...(link ? ['', link] : []), '', 'alex / the BIRDHAUS'].join('\n') + emailTextFooter(),
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

  const hello = `Hi ${l.name.split(' ')[0]},`;
  const body =
    s.emailLeadAutoreply ||
    "Thanks for your interest in the BIRDHAUS rehearsal space! I read every one of these myself. If it's a fit, I'll send you a private link where you can see open times and book. Usually within a few days.";
  await send({
    template: 'rehearsal-lead-autoreply',
    to: l.email,
    subject: 'Thanks — the BIRDHAUS rehearsal space',
    html: emailDocument({
      preheader: 'Got your note about the rehearsal space',
      body: emailP(esc(hello)) + paragraphs(body) + emailP('alex / the BIRDHAUS'),
    }),
    text: [hello, '', body, '', 'alex / the BIRDHAUS'].join('\n') + emailTextFooter(),
    replyTo: REPLY_TO,
  });
}

// --- 11. Invite -> band: their private booking link ------------------------------------

export async function sendInviteEmail(bandId: number): Promise<boolean> {
  const band = await bandContact(bandId);
  const link = await liveLink(bandId);
  if (!band || !link) return false;
  const s = await getRehearsalSettings();
  const hello = band.contactName ? `Hi ${band.contactName.split(' ')[0]},` : 'Hi!';
  const how = [
    'Tap an open block to book it once, or make it repeat.',
    'Send the request. I confirm by email with the address and how to pay.',
    `Pay per session by Venmo (${money(s.priceCents)} a block${
      s.repeatPriceCents !== null && s.repeatPriceCents !== s.priceCents ? `, ${money(s.repeatPriceCents)} when it repeats` : ''
    }).`,
  ];
  const ok = await send({
    template: 'rehearsal-invite',
    to: band.email,
    subject: 'Your link to book the BIRDHAUS rehearsal space',
    html: emailDocument({
      preheader: 'Your private booking link',
      body:
        emailP(esc(hello)) +
        emailP(`Here's your private link for booking the BIRDHAUS rehearsal space${band.name ? ` as <strong>${esc(band.name)}</strong>` : ''}:`) +
        emailButton(link, 'Book the rehearsal space') +
        emailP(how.map((x, i) => `${i + 1}. ${esc(x)}`).join('<br>')) +
        emailSmall('The link is just for you: please don’t share it. Lost it? Reply and I’ll send a new one.') +
        emailP('alex / the BIRDHAUS'),
    }),
    text:
      [hello, '', "Here's your private link for booking the BIRDHAUS rehearsal space:", link, '', ...how.map((x, i) => `${i + 1}. ${x}`), '', 'The link is just for you: please don’t share it.', '', 'alex / the BIRDHAUS'].join('\n') +
      emailTextFooter(),
    replyTo: REPLY_TO,
  });
  return ok;
}
