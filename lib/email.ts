import { Resend } from 'resend';
import { logBlocked, logStaging, outboundAllowed, stagingEmailTo } from './staging';

// The one place the app makes a Resend client. Every sender (RSVP, advance,
// tickets, timesheet, alerts, accounts, the inbound forwarder) calls this.
//
// On a production deploy that isn't staging it's a plain Resend client. Anywhere
// else (staging, previews, local dev — see lib/staging.ts) the sending methods
// are swapped out:
//   * BH_STAGING_EMAIL_TO set: each message goes to that one address instead,
//     cc/bcc and reply-to dropped (a reply-to can carry an advance reply token
//     that prod's inbound webhook would act on), subject tagged, and a
//     `[staging] redirected email` line logged.
//   * unset: nothing is sent; a `[staging] blocked email` line is logged.
// Either way the line carries the caller's template label, the subject and
// the original recipient count — never an address.
//
// `template` names the email for those log lines ('rsvp-confirmation', ...).
// Production ignores it.
//
// Instantiated lazily, at request time: Resend's constructor throws without a
// key, and `next build` imports these modules to collect page data.

type SendPayload = Parameters<Resend['emails']['send']>[0];
type SendResult = Awaited<ReturnType<Resend['emails']['send']>>;
type BatchPayload = Parameters<Resend['batch']['send']>[0];
type BatchResult = Awaited<ReturnType<Resend['batch']['send']>>;
type ForwardPayload = Parameters<Resend['emails']['receiving']['forward']>[0];
type ForwardResult = Awaited<ReturnType<Resend['emails']['receiving']['forward']>>;

// Stand-in key for log-only mode, so a deploy without RESEND_API_KEY can still
// build a client. Its network methods are replaced below before anything runs.
const PLACEHOLDER_KEY = 're_staging_log_only';

function recipientCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return value ? 1 : 0;
}

function originalRecipients(payload: SendPayload): number {
  return recipientCount(payload.to) + recipientCount(payload.cc) + recipientCount(payload.bcc);
}

function redirect(payload: SendPayload, to: string): SendPayload {
  const copy = { ...payload, to, subject: `[staging · ${originalRecipients(payload)} recipient(s)] ${payload.subject}` };
  delete copy.cc;
  delete copy.bcc;
  delete copy.replyTo;
  return copy;
}

function fakeId(prefix: string): string {
  return `staging-${prefix}-${Date.now()}`;
}

export function getResendClient(template = 'unlabelled'): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (outboundAllowed()) {
    if (!apiKey) throw new Error('RESEND_API_KEY is not set');
    return new Resend(apiKey);
  }

  const testTo = stagingEmailTo();
  if (testTo && !apiKey) throw new Error('BH_STAGING_EMAIL_TO is set but RESEND_API_KEY is not');
  const client = new Resend(testTo ? apiKey : PLACEHOLDER_KEY);
  const realSend = client.emails.send.bind(client.emails);
  const realBatch = client.batch.send.bind(client.batch);

  client.emails.send = (async (payload: SendPayload) => {
    const detail = { template, subject: payload.subject ?? null, recipients: originalRecipients(payload) };
    if (testTo) {
      logStaging('redirected email', detail);
      return realSend(redirect(payload, testTo));
    }
    logBlocked('email', detail);
    return { data: { id: fakeId('email') }, error: null, headers: null } as SendResult;
  }) as Resend['emails']['send'];

  client.batch.send = (async (payloads: BatchPayload) => {
    const detail = {
      template,
      subject: payloads[0]?.subject ?? null,
      messages: payloads.length,
      recipients: payloads.reduce((n, p) => n + originalRecipients(p as SendPayload), 0),
    };
    if (testTo) {
      logStaging('redirected email batch', detail);
      return realBatch(payloads.map((p) => redirect(p as SendPayload, testTo)) as BatchPayload);
    }
    logBlocked('email batch', detail);
    return { data: { data: payloads.map(() => ({ id: fakeId('batch') })) }, error: null, headers: null } as BatchResult;
  }) as Resend['batch']['send'];

  // Forwarding an inbound reply sends mail to the advance watchers. Off the
  // production site it's never forwarded, test address or not.
  client.emails.receiving.forward = (async (payload: ForwardPayload) => {
    logBlocked('email forward', { template, recipients: recipientCount(payload.to) });
    return { data: { id: fakeId('forward') }, error: null, headers: null } as unknown as ForwardResult;
  }) as Resend['emails']['receiving']['forward'];

  return client;
}
