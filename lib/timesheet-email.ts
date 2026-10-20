// Admin notifications for the timesheet: a heads-up when a helper logs new
// hours, and a weekly reminder of hours still unpaid after a week. Sent through
// Resend, same lazy-client pattern as lib/rsvp-email.ts so a missing key never
// breaks `next build`.

import { getResendClient } from './email';
import { EMAIL_COLORS, EMAIL_FONT, emailDetails, emailDocument, emailLink, emailP, emailTextFooter } from './email-layout';
import { SITE_URL } from './site';
import type { TimesheetEntry } from './timesheet-shared';

// Where the owner wants these notifications. Falls back to the org address
// already used as the RSVP/advance BCC.
function notifyTo(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || 'alex@thebirdhaus.org';
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// "13:05:00" -> "1:05 PM"
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TIMESHEET_URL = `${SITE_URL}/admin/timesheet`;

// (a) A new entry was logged. Best-effort — the caller swallows failures so a
// mail hiccup never blocks the helper's save.
export async function sendNewTimesheetEntryEmail(entry: TimesheetEntry): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const subject = `Timesheet: ${entry.worker_name} logged ${entry.hours.toFixed(2)} hrs (${formatCurrency(
    entry.payout
  )})`;

  const lines = [
    `${entry.worker_name} logged new hours:`,
    '',
    `Date: ${formatDate(entry.work_date)}`,
    `Time: ${formatTime(entry.clock_in)} – ${formatTime(entry.clock_out)}`,
    `Hours: ${entry.hours.toFixed(2)}`,
    `Payout: ${formatCurrency(entry.payout)}`,
  ];
  if (entry.note) lines.push(`Note: ${entry.note}`);
  lines.push('', `Review: ${TIMESHEET_URL}`);
  const text = lines.join('\n') + emailTextFooter('admin');

  // Minimal admin shell (lib/email-layout).
  const details: Array<[string, string]> = [
    ['Date', esc(formatDate(entry.work_date))],
    ['Time', `${esc(formatTime(entry.clock_in))} – ${esc(formatTime(entry.clock_out))}`],
    ['Hours', entry.hours.toFixed(2)],
    ['Payout', `<strong>${esc(formatCurrency(entry.payout))}</strong>`],
  ];
  if (entry.note) details.push(['Note', esc(entry.note)]);
  const html = emailDocument({
    variant: 'admin',
    body:
      emailP(`<strong>${esc(entry.worker_name)}</strong> logged new hours:`) +
      emailDetails(details) +
      emailP(emailLink(TIMESHEET_URL, 'Review the timesheet →')),
  });

  const { error } = await getResendClient('timesheet-new-entry').emails.send({ from, to: notifyTo(), subject, html, text });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}

// (b) Weekly reminder: entries still unpaid after more than a week.
export async function sendUnpaidTimesheetReminderEmail(entries: TimesheetEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const total = entries.reduce((sum, e) => sum + e.payout, 0);
  const subject = `Timesheet: ${formatCurrency(total)} unpaid (${entries.length} ${
    entries.length === 1 ? 'entry' : 'entries'
  } over a week old)`;

  const rowText = entries
    .map((e) => `• ${formatDate(e.work_date)} — ${e.worker_name} — ${e.hours.toFixed(2)} hrs — ${formatCurrency(e.payout)}`)
    .join('\n');
  const text = [
    `These timesheet entries are more than a week old and still unpaid:`,
    '',
    rowText,
    '',
    `Total unpaid: ${formatCurrency(total)}`,
    '',
    `Mark them paid: ${TIMESHEET_URL}`,
  ].join('\n') + emailTextFooter('admin');

  // Minimal admin shell (lib/email-layout): one row per entry.
  const cell = `padding:6px 12px 6px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.4;color:${EMAIL_COLORS.ink};border-bottom:1px solid ${EMAIL_COLORS.rule};`;
  const rowHtml = entries
    .map(
      (e) =>
        `<tr>` +
        `<td style="${cell}">${esc(formatDate(e.work_date))}</td>` +
        `<td style="${cell}">${esc(e.worker_name)}</td>` +
        `<td style="${cell}text-align:right;white-space:nowrap;">${e.hours.toFixed(2)} hrs</td>` +
        `<td style="${cell}padding-right:0;text-align:right;"><strong>${esc(formatCurrency(e.payout))}</strong></td>` +
        `</tr>`
    )
    .join('');
  const html = emailDocument({
    variant: 'admin',
    body:
      emailP('These timesheet entries are more than a week old and still unpaid:') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;">${rowHtml}</table>` +
      emailP(`<strong>Total unpaid: ${esc(formatCurrency(total))}</strong>`) +
      emailP(emailLink(TIMESHEET_URL, 'Mark them paid →')),
  });

  const { error } = await getResendClient('timesheet-unpaid-reminder').emails.send({ from, to: notifyTo(), subject, html, text });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
