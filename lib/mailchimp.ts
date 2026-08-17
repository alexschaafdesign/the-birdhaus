import crypto from 'crypto';
import { splitName } from './name';

function subscriberHash(email: string): string {
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

// Mailchimp API keys are always "<key>-<datacenter>" (e.g. "...-us12"). The
// datacenter is the API host prefix; we surface it (not the key) in diagnostics.
function datacenterFrom(apiKey: string): string | null {
  const dc = apiKey.split('-').pop();
  return dc && dc !== apiKey ? dc : null;
}

export interface MailchimpConfigStatus {
  configured: boolean;
  apiKeyPresent: boolean;
  audiencePresent: boolean;
  // Parsed from the key's suffix — safe to log/display; never the key itself.
  datacenter: string | null;
}

// Non-throwing config probe for health checks, the admin settings card, and the
// RSVP route (so a missing config can be logged distinctly from an API failure).
export function getMailchimpConfigStatus(): MailchimpConfigStatus {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const apiKeyPresent = !!apiKey;
  const audiencePresent = !!audienceId;
  return {
    configured: apiKeyPresent && audiencePresent,
    apiKeyPresent,
    audiencePresent,
    datacenter: apiKey ? datacenterFrom(apiKey) : null,
  };
}

export interface MailchimpPingResult {
  ok: boolean;
  // 'unconfigured' = env vars missing; 'unreachable' = network/fetch threw;
  // otherwise the HTTP status from Mailchimp (200 = creds + audience valid).
  status: number | 'unconfigured' | 'unreachable';
  detail?: string;
}

// Live check that the configured key + audience actually work, by reading the
// audience. Used by the health endpoint's opt-in `?live=1` probe. Does NOT throw.
export async function pingMailchimp(): Promise<MailchimpPingResult> {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    return { ok: false, status: 'unconfigured', detail: 'MAILCHIMP_API_KEY or MAILCHIMP_AUDIENCE_ID is not set' };
  }
  const datacenter = datacenterFrom(apiKey);
  try {
    const response = await fetch(
      `https://${datacenter}.api.mailchimp.com/3.0/lists/${audienceId}?fields=id,name,stats.member_count`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
        },
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, detail: text.slice(0, 300) };
    }
    return { ok: true, status: 200 };
  } catch (err) {
    return { ok: false, status: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }
}

// Fire-and-forget by design: callers should not await this on the request path.
// A Mailchimp outage must never delay or fail an RSVP submission — throws here
// are for the caller to catch and log, not to propagate.
export async function upsertMailchimpSubscriber({
  email,
  name,
}: {
  email: string;
  name: string;
}): Promise<void> {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    throw new Error('MAILCHIMP_API_KEY or MAILCHIMP_AUDIENCE_ID is not set');
  }

  const datacenter = datacenterFrom(apiKey);
  const { firstName, lastName } = splitName(name);

  const response = await fetch(
    `https://${datacenter}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash(email)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        merge_fields: { FNAME: firstName, LNAME: lastName },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Mailchimp upsert failed (${response.status}): ${text}`);
  }
}
