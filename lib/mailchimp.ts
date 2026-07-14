import crypto from 'crypto';
import { splitName } from './name';

function subscriberHash(email: string): string {
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
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

  // Mailchimp API keys are always "<key>-<datacenter>" (e.g. "...-us12").
  const datacenter = apiKey.split('-').pop();
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
