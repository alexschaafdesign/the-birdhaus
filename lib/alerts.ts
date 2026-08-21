// Admin failure alerts (email via Resend) with a DB-backed throttle so a burst
// of serverless invocations during an outage can't flood the inbox. Same lazy
// Resend client pattern as lib/timesheet-email.ts so a missing key never breaks
// `next build`.

import { Resend } from 'resend';
import { sql } from './db';

function notifyTo(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || 'alex@thebirdhaus.org';
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Claim the right to send one alert for `key`. Returns true iff no alert for
// this key has been sent within `minIntervalMs`. The conditional upsert makes
// the claim race-safe across concurrent lambdas: only one caller gets a row
// back, everyone else's update is filtered out by the WHERE.
export async function claimAlertSlot(key: string, minIntervalMs = 3_600_000): Promise<boolean> {
  const rows = await sql`
    insert into admin_alerts (key, last_sent_at)
    values (${key}, now())
    on conflict (key) do update set last_sent_at = now()
      where admin_alerts.last_sent_at < now() - make_interval(secs => ${minIntervalMs / 1000})
    returning key
  `;
  return rows.length > 0;
}

// Plain "something is broken" email to the admin. `lines` become paragraphs;
// callers pass preformatted strings (no markup).
export async function sendAdminAlertEmail(subject: string, lines: string[]): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const text = lines.join('\n');
  const html = `
<p><strong>${esc(subject)}</strong></p>
<p style="margin:16px 0;">${lines.map((l) => esc(l)).join('<br>')}</p>
`;

  const { error } = await getResendClient().emails.send({ from, to: notifyTo(), subject, html, text });
  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
}
