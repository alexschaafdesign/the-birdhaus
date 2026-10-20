// Emails for Birdhaus accounts (crew, staff): the crew invite and the password
// reset. Their single-use set-password link goes to this site's own
// /invite/<token> page.

import { getResendClient } from '../email';
import { SITE_URL } from '../site';
import { splitName } from '../name';
import { emailButton, emailDocument, emailP, emailSmall, emailTextFooter } from '../email-layout';

const NOTIFY_EMAIL = 'alex@thebirdhaus.org';

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
    const { error } = await getResendClient('account-admin-copy').emails.send({
      from,
      to: NOTIFY_EMAIL,
      subject,
      ...renderAdminCopyEmail(line),
    });
    if (error) console.error('[account-email] admin note failed:', error);
  } catch (err) {
    console.error('[account-email] admin note failed:', err);
  }
}

// The admin heads-up's body: one line, in the minimal admin shell.
export function renderAdminCopyEmail(line: string): { html: string; text: string } {
  return {
    html: emailDocument({ variant: 'admin', body: emailP(esc(line)) }),
    text: line + emailTextFooter('admin'),
  };
}

export function accountSetupLinkFor(token: string): string {
  return `${SITE_URL}/invite/${token}`;
}

// Invites someone to the Birdhaus crew: a login with full admin access, worded
// for a collaborator (not a Song Club member). After they pick a password the
// accept route drops them into /admin.
// The crew invite (2027 email shell). Copy unchanged; the layout is new.
export function renderCrewInviteEmail({
  name,
  token,
  title,
}: {
  name: string;
  token: string;
  title?: string | null;
}): { subject: string; html: string; text: string } {
  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = accountSetupLinkFor(token);
  const roleLine = title
    ? `You're being set up as ${title} on the Birdhaus admin.`
    : `You're being set up with a login for the Birdhaus admin.`;
  const dontForward = 'This link is just for you — please don’t forward it.';

  const text =
    [
      greeting,
      '',
      roleLine,
      'Pick a password to get in — your dashboard is waiting:',
      link,
      '',
      dontForward,
      '',
      '— the BIRDHAUS',
    ].join('\n') + emailTextFooter();

  const html = emailDocument({
    preheader: 'Pick a password to get into the Birdhaus admin.',
    body:
      emailP(esc(greeting)) +
      emailP(esc(roleLine)) +
      emailButton(link, 'Pick a password &amp; get in') +
      emailSmall(`Or paste this link into your browser:<br>${esc(link)}`) +
      emailSmall(esc(dontForward)) +
      emailP('— the BIRDHAUS'),
  });

  return { subject: "You're on the Birdhaus crew", html, text };
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
  const { subject, html, text } = renderCrewInviteEmail({ name, token, title });

  const { error } = await getResendClient('crew-invite').emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  await notifyAdminCopy(
    'Crew invite sent',
    `Crew invite emailed to ${name} <${email}>${title ? ` (${title})` : ''}.`
  );
}

// The password reset (2027 email shell). Copy unchanged; the layout is new.
export function renderPasswordResetEmail({ name, token }: { name: string; token: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = splitName(name).firstName;
  const greeting = firstName ? `hi ${firstName}!` : 'hi there!';
  const link = accountSetupLinkFor(token);
  const asked = 'Someone (hopefully you) asked to reset your Birdhaus password.';
  const ignore = "If you didn't ask for this, you can ignore this email.";

  const text =
    [greeting, '', asked, 'Set a new one here (link expires in 2 hours):', link, '', ignore, '', '— the BIRDHAUS'].join('\n') +
    emailTextFooter();

  const html = emailDocument({
    preheader: 'Set a new Birdhaus password. The link expires in 2 hours.',
    body:
      emailP(esc(greeting)) +
      emailP(esc(asked)) +
      emailButton(link, 'Set a new password') +
      emailSmall(`The link expires in 2 hours. Or paste it into your browser:<br>${esc(link)}`) +
      emailSmall(esc(ignore)) +
      emailP('— the BIRDHAUS'),
  });

  return { subject: 'Reset your Birdhaus password', html, text };
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
  const { subject, html, text } = renderPasswordResetEmail({ name, token });

  const { error } = await getResendClient('password-reset').emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
