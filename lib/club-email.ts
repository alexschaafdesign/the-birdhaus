// Invite + password-reset emails for Song Club portal members, sent through
// Resend (same lazy-client pattern as lib/song-club-email.ts). Both carry a
// single-use set-password link to /club/invite/<token>.

import { Resend } from 'resend';
import { SITE_URL } from './site';
import { splitName } from './name';

const BCC_EMAIL = 'alex@thebirdhaus.org';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setupLinkFor(token: string): string {
  return `${SITE_URL}/club/invite/${token}`;
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
    "You're invited to the Song Club portal — a private space for the club to",
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
<p>You're invited to the <strong>Song Club portal</strong> — a private space for the club to share songs, files, and messages between meetups.</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Pick a password &amp; join</a></p>
<p style="font-size: 13px; color: #777;">Or paste this link into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">This link is just for you — please don't forward it.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    bcc: BCC_EMAIL,
    subject: "You're invited to the Song Club portal",
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
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
    'Someone (hopefully you) asked to reset your Song Club portal password.',
    'Set a new one here (link expires in 2 hours):',
    link,
    '',
    "If you didn't ask for this, you can ignore this email.",
    '',
    '— the BIRDHAUS',
  ].join('\n');

  const html = `<p>${esc(greeting)}</p>
<p>Someone (hopefully you) asked to reset your Song Club portal password.</p>
<p><a href="${esc(link)}" style="display: inline-block; background: #2A2420; color: #E8E0D0; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Set a new password</a></p>
<p style="font-size: 13px; color: #777;">The link expires in 2 hours. Or paste it into your browser:<br>${esc(link)}</p>
<p style="font-size: 13px; color: #777;">If you didn't ask for this, you can ignore this email.</p>
<p>— the BIRDHAUS</p>`;

  const { error } = await getResendClient().emails.send({
    from,
    to: email,
    subject: 'Reset your Song Club portal password',
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
