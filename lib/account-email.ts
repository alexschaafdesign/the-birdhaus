// Emails for Birdhaus accounts (crew, staff): the crew invite and the password
// reset. Their single-use set-password link goes to this site's own
// /invite/<token> page, never the Song Club portal, so they keep working once
// the portal moves out. Member-facing portal mail stays in lib/club-email.ts.

import { Resend } from 'resend';
import { SITE_URL } from './site';
import { splitName } from './name';

const NOTIFY_EMAIL = 'alex@thebirdhaus.org';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

function requireFrom(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');
  return from;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Token-free heads-up to the venue inbox when an invite goes out — the invite
// itself must never be copied anywhere (its link sets the password).
// Best-effort: a failure here never blocks the real send.
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
    if (error) console.error('[account-email] admin note failed:', error);
  } catch (err) {
    console.error('[account-email] admin note failed:', err);
  }
}

export function accountSetupLinkFor(token: string): string {
  return `${SITE_URL}/invite/${token}`;
}

// Invites someone to the Birdhaus crew: a login with full admin access, worded
// for a collaborator (not a Song Club member). After they pick a password the
// accept route drops them into /admin.
export async function sendCrewInviteEmail({
  name,
  email,
  token,
  title,
}: {
  name: string;
  email: string;
  token: string;
  title?: string | null;
}): Promise<void> {
  const from = requireFrom();

  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = accountSetupLinkFor(token);
  const roleLine = title
    ? `You're being set up as ${title} on the Birdhaus admin.`
    : `You're being set up with a login for the Birdhaus admin.`;

  const text = [
    greeting,
    '',
    roleLine,
    'Pick a password to get in — your dashboard is waiting:',
    link,
    '',
    'This link is just for you — please don’t forward it.',
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>${esc(roleLine)}</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Pick a password &amp; get in</a></p>
<p style="font-size: 13px; color: #777;">Or paste this link into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">This link is just for you — please don't forward it.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    subject: "You're on the Birdhaus crew",
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  await notifyAdminCopy(
    'Crew invite sent',
    `Crew invite emailed to ${name} <${email}>${title ? ` (${title})` : ''}.`
  );
}

export async function sendAccountPasswordResetEmail({
  name,
  email,
  token,
}: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const from = requireFrom();

  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = accountSetupLinkFor(token);

  const text = [
    greeting,
    '',
    'Someone (hopefully you) asked to reset your Birdhaus password.',
    'Set a new one here (link expires in 2 hours):',
    link,
    '',
    "If you didn't ask for this, you can ignore this email.",
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>Someone (hopefully you) asked to reset your Birdhaus password.</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Set a new password</a></p>
<p style="font-size: 13px; color: #777;">The link expires in 2 hours. Or paste it into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">If you didn't ask for this, you can ignore this email.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    subject: 'Reset your Birdhaus password',
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
