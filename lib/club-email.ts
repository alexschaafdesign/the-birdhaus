// Invite + password-reset emails for Song Club portal members, sent through
// Resend (same lazy-client pattern as lib/song-club-email.ts). Both carry a
// single-use set-password link to /song-club/invite/<token>. Crew/staff mail
// (crew invite, Birdhaus password reset) lives in lib/account-email.ts.

import { Resend } from 'resend';
import {
  SITE_URL,
  PORTAL_URL,
  PORTAL_SPLIT,
  PORTAL_SITE_NAME,
  PORTAL_NAME,
  PORTAL_HEADING,
  PORTAL_PLACE,
} from './site';
import { splitName } from './name';

const NOTIFY_EMAIL = 'alex@thebirdhaus.org';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

// Token-free heads-up to the venue inbox when an invite/signup email goes out.
// The member emails themselves must never be copied anywhere — their links set
// the account's password — so admin visibility comes from this separate note
// instead of a bcc. Best-effort: a failure here never blocks the real send.
async function notifyAdminCopy(subject: string, line: string): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return;
  try {
    const { error } = await getResendClient().emails.send({
      from,
      to: NOTIFY_EMAIL,
      subject,
      text: line,
    });
    if (error) console.error('[club-email] admin note failed:', error);
  } catch (err) {
    console.error('[club-email] admin note failed:', err);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setupLinkFor(token: string, next?: string): string {
  const base = `${PORTAL_URL}/song-club/invite/${token}`;
  // `next` is a safe relative path (validated by the caller) to send the member
  // to after they set their password — e.g. back to an event to auto-join.
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

export async function sendClubInviteEmail({
  name,
  email,
  token,
}: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = setupLinkFor(token);

  const text = [
    greeting,
    '',
    `You're invited to ${PORTAL_PLACE} — a private space for the club to`,
    'share songs, files, and messages between meetups.',
    '',
    'Pick a password to join:',
    link,
    '',
    'This link is just for you — please don’t forward it.',
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>You're invited to ${PORTAL_SPLIT ? '' : 'the '}<strong>${PORTAL_HEADING}</strong> — a private space for the club to share songs, files, and messages between meetups.</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Pick a password &amp; join</a></p>
<p style="font-size: 13px; color: #777;">Or paste this link into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">This link is just for you — please don't forward it.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from: portalFrom(from),
    to: email,
    subject: `You're invited to ${PORTAL_PLACE}`,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  await notifyAdminCopy('Song Club invite sent', `Portal invite emailed to ${name} <${email}>.`);
}

// Notifies a track's uploader that someone commented. Best-effort: the caller
// swallows failures so a Resend outage never breaks posting a comment.
export async function sendTrackCommentEmail({
  to,
  uploaderName,
  commenterName,
  trackTitle,
  trackUrl,
  comment,
}: {
  to: string;
  uploaderName: string;
  commenterName: string;
  trackTitle: string;
  trackUrl: string; // absolute /song-club/track/<id> link
  comment: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const firstName = splitName(uploaderName).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const snippet = comment.length > 300 ? `${comment.slice(0, 300)}…` : comment;

  const text = [
    greeting,
    '',
    `${commenterName} commented on your track "${trackTitle}":`,
    '',
    snippet,
    '',
    `Reply on the portal: ${trackUrl}`,
    '',
    'To stop these, turn off track-comment emails in your account settings.',
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p><strong>${esc(commenterName)}</strong> commented on your track <strong>${esc(trackTitle)}</strong>:</p>
<blockquote style="border-left: 3px solid #c8a26a; margin: 12px 0; padding: 4px 0 4px 12px; color: #444; white-space: pre-wrap;">${esc(snippet)}</blockquote>
<p><a href="${esc(trackUrl)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reply on the portal</a></p>
<p style="font-size: 12px; color: #999;">To stop these, turn off track-comment emails in your account settings.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from: portalFrom(from),
    to,
    subject: `${commenterName} commented on "${trackTitle}"`,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}

// A Birdhaus board post, emailed to a member who wants announcements. One
// send per recipient (personalized greeting + settings note). Caller loops.
// A single Resend email payload. Callers build these and hand a whole array to
// sendEmailBatch, which posts them in ONE request per 100 — see the note there.
export interface ResendEmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Member-facing portal emails go out under the portal's name once the split is
// on — same address, so deliverability doesn't change. RESEND_FROM_EMAIL may
// be a bare address or "Name <address>".
function portalFrom(from: string): string {
  if (!PORTAL_SPLIT) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  return `${PORTAL_SITE_NAME} <${address}>`;
}

function requireFrom(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');
  return from;
}

// Sends many emails through Resend's BATCH endpoint (up to 100 per request), so
// a club-wide blast is a couple of API calls instead of N concurrent ones. The
// old path fired one send per recipient via Promise.allSettled, which tripped
// Resend's per-request rate limit (~2/sec) and silently dropped most of a large
// blast — a 54-person announcement only landed ~10. 'permissive' validation
// keeps one bad address from failing the whole chunk. Best-effort: a chunk-level
// error is logged, not thrown, so a Resend hiccup never breaks the caller's
// underlying action. Returns how many Resend accepted.
export async function sendEmailBatch(emails: ResendEmailPayload[]): Promise<number> {
  if (emails.length === 0) return 0;
  const client = getResendClient();
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const { data, error } = await client.batch.send(chunk, { batchValidation: 'permissive' });
      if (error) {
        console.error('[club-email] batch send failed:', error);
        continue;
      }
      sent += data?.data?.length ?? 0;
      const skipped = 'errors' in (data ?? {}) ? (data as { errors?: unknown[] }).errors : undefined;
      if (Array.isArray(skipped) && skipped.length > 0) {
        console.error(`[club-email] batch skipped ${skipped.length} invalid email(s):`, skipped[0]);
      }
    } catch (err) {
      console.error('[club-email] batch send threw:', err);
    }
  }
  return sent;
}

export function buildAnnouncementEmail({
  to,
  recipientName,
  body,
  portalUrl,
}: {
  to: string;
  recipientName: string;
  body: string;
  portalUrl: string;
}): ResendEmailPayload {
  const firstName = splitName(recipientName).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';

  const text = [
    greeting,
    '',
    `New from the Birdhaus in ${PORTAL_PLACE}:`,
    '',
    body,
    '',
    `Open the portal: ${portalUrl}`,
    '',
    'To stop announcement emails, turn them off in your account settings.',
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>New from the Birdhaus in ${PORTAL_PLACE}:</p>
<blockquote style="border-left: 3px solid #c8a26a; margin: 12px 0; padding: 4px 0 4px 12px; color: #444; white-space: pre-wrap;">${esc(body)}</blockquote>
<p><a href="${esc(portalUrl)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open the portal</a></p>
<p style="font-size: 12px; color: #999;">To stop announcement emails, turn them off in your account settings.</p>
<p>— the BIRDHAUS</p>`;

  return { from: portalFrom(requireFrom()), to, subject: `New in ${PORTAL_PLACE}`, html, text };
}

// A newly-published Song Club event, emailed to a member who wants event
// notifications. Details come from the event record. Built for a batch blast.
export function buildClubEventEmail({
  to,
  recipientName,
  title,
  dateLabel,
  eventUrl,
}: {
  to: string;
  recipientName: string;
  title: string;
  dateLabel: string;
  eventUrl: string;
}): ResendEmailPayload {
  const firstName = splitName(recipientName).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';

  const text = [
    greeting,
    '',
    `New ${PORTAL_NAME} event: ${title} — ${dateLabel}.`,
    '',
    `Details & RSVP: ${eventUrl}`,
    '',
    'To stop event emails, turn them off in your account settings.',
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>New ${PORTAL_NAME} event: <strong>${esc(title)}</strong> — ${esc(dateLabel)}.</p>
<p><a href="${esc(eventUrl)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">Details &amp; RSVP</a></p>
<p style="font-size: 12px; color: #999;">To stop event emails, turn them off in your account settings.</p>
<p>— the BIRDHAUS</p>`;

  return { from: portalFrom(requireFrom()), to, subject: `New ${PORTAL_NAME} event: ${title}`, html, text };
}

// Self-signup: confirm your email + set a password. Same link target as an
// invite, worded for someone who came to the site on their own.
export async function sendClubSignupEmail({
  name,
  email,
  token,
  next,
}: {
  name: string;
  email: string;
  token: string;
  next?: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = setupLinkFor(token, next);

  const text = [
    greeting,
    '',
    `Confirm your email and set a password to join ${PORTAL_PLACE}:`,
    link,
    '',
    "If you didn't request this, you can ignore this email.",
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>Confirm your email and set a password to join ${PORTAL_SPLIT ? '' : 'the '}<strong>${PORTAL_HEADING}</strong>:</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Confirm &amp; set password</a></p>
<p style="font-size: 13px; color: #777;">Or paste this link into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">If you didn't request this, you can ignore this email.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from: portalFrom(from),
    to: email,
    subject: `Confirm your email to join ${PORTAL_NAME}`,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}

// Actionable heads-up to the venue inbox when a genuinely new member signs up.
// New signups have no event/group yet and can't upload until an admin assigns
// them a group, so this points straight at the members page. Only fire this for
// brand-new accounts (not invite re-sends). Best-effort: never blocks signup.
export async function sendNewMemberAdminEmail({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return;
  const membersUrl = `${SITE_URL}/admin/song-club/members`;
  const who = `${name} <${email}>`;

  const text = [
    `${name} just signed up for Song Club.`,
    '',
    'Assign them to a group so they can start uploading:',
    membersUrl,
    '',
    who,
  ].join('\n');

  const html = `<p><strong>${esc(name)}</strong> just signed up for Song Club.</p>
<p>Assign them to a group so they can start uploading:</p>
<p><a href="${esc(membersUrl)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open members</a></p>
<p style="font-size: 13px; color: #777;">${esc(who)}</p>`;

  try {
    const { error } = await getResendClient().emails.send({
      from,
      to: NOTIFY_EMAIL,
      subject: `New Song Club signup: ${name}`,
      html,
      text,
    });
    if (error) console.error('[club-email] new-member note failed:', error);
  } catch (err) {
    console.error('[club-email] new-member note failed:', err);
  }
}

export async function sendClubPasswordResetEmail({
  name,
  email,
  token,
}: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = setupLinkFor(token);

  const text = [
    greeting,
    '',
    `Someone (hopefully you) asked to reset your ${PORTAL_HEADING} password.`,
    'Set a new one here (link expires in 2 hours):',
    link,
    '',
    "If you didn't ask for this, you can ignore this email.",
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>Someone (hopefully you) asked to reset your ${PORTAL_HEADING} password.</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Set a new password</a></p>
<p style="font-size: 13px; color: #777;">The link expires in 2 hours. Or paste it into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">If you didn't ask for this, you can ignore this email.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from: portalFrom(from),
    to: email,
    subject: `Reset your ${PORTAL_HEADING} password`,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
