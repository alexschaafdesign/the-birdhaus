// Admin notifications for the timesheet: a heads-up when a helper logs new
// hours, and a weekly reminder of hours still unpaid after a week. Sent through
// Resend, same lazy-client pattern as lib/rsvp-email.ts so a missing key never
// breaks `next build`.

import { Resend } from 'resend';
import { SITE_URL } from './site';
import type { TimesheetEntry } from './timesheet-shared';

// Where the owner wants these notifications. Falls back to the org address
// already used as the RSVP/advance BCC.
function notifyTo(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || 'alex@thebirdhaus.org';
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
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
  const text = lines.join('\n');

  const html = `
<p><strong>${esc(entry.worker_name)}</strong> logged new hours:</p>
<p style="margin:16px 0;">
  <strong>Date:</strong> ${esc(formatDate(entry.work_date))}<br>
  <strong>Time:</strong> ${esc(formatTime(entry.clock_in))} – ${esc(formatTime(entry.clock_out))}<br>
  <strong>Hours:</strong> ${entry.hours.toFixed(2)}<br>
  <strong>Payout:</strong> ${esc(formatCurrency(entry.payout))}${
    entry.note ? `<br><strong>Note:</strong> ${esc(entry.note)}` : ''
  }
</p>
<p><a href="${TIMESHEET_URL}">Review the timesheet →</a></p>
`;

  const { error } = await getResendClient().emails.send({ from, to: notifyTo(), subject, html, text });
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
  ].join('\n');

  const rowHtml = entries
    .map(
      (e) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;">${esc(formatDate(e.work_date))}</td>
          <td style="padding:4px 12px 4px 0;">${esc(e.worker_name)}</td>
          <td style="padding:4px 12px 4px 0;text-align:right;">${e.hours.toFixed(2)} hrs</td>
          <td style="padding:4px 0;text-align:right;"><strong>${esc(formatCurrency(e.payout))}</strong></td>
        </tr>`
    )
    .join('\n');
  const html = `
<p>These timesheet entries are more than a week old and still unpaid:</p>
<table style="border-collapse:collapse;margin:12px 0;">${rowHtml}</table>
<p><strong>Total unpaid: ${esc(formatCurrency(total))}</strong></p>
<p><a href="${TIMESHEET_URL}">Mark them paid →</a></p>
`;

  const { error } = await getResendClient().emails.send({ from, to: notifyTo(), subject, html, text });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
