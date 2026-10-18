import { Resend } from 'resend';
import { logBlocked, outboundAllowed, stagingEmailTo } from './staging';

// The one place the app makes a Resend client. Every sender (RSVP, advance,
// tickets, timesheet, alerts, accounts, the inbound forwarder) calls this.
//
// On a production deploy that isn't staging it's a plain Resend client. Anywhere
// else (staging, previews, local dev — see lib/staging.ts) the sending methods
// are swapped out:
//   * BH_STAGING_EMAIL_TO set: each message goes to that one address instead,
//     cc/bcc and reply-to dropped (a reply-to can carry an advance reply token
//     that prod's inbound webhook would act on), subject tagged.
//   * unset: nothing is sent; a count-only line is logged.
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

function redirect(payload: SendPayload, to: string): SendPayload {
  const original = recipientCount(payload.to) + recipientCount(payload.cc) + recipientCount(payload.bcc);
  const copy = { ...payload, to, subject: `[staging · ${original} recipient(s)] ${payload.subject}` };
  delete copy.cc;
  delete copy.bcc;
  delete copy.replyTo;
  return copy;
}

function fakeId(prefix: string): string {
  return `staging-${prefix}-${Date.now()}`;
}

export function getResendClient(): Resend {
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
    if (testTo) return realSend(redirect(payload, testTo));
    logBlocked('email', { subject: payload.subject ?? null, recipients: recipientCount(payload.to) + recipientCount(payload.cc) + recipientCount(payload.bcc) });
    return { data: { id: fakeId('email') }, error: null, headers: null } as SendResult;
  }) as Resend['emails']['send'];

  client.batch.send = (async (payloads: BatchPayload) => {
    if (testTo) return realBatch(payloads.map((p) => redirect(p as SendPayload, testTo)) as BatchPayload);
    logBlocked('email batch', { messages: payloads.length, subject: payloads[0]?.subject ?? null });
    return { data: { data: payloads.map(() => ({ id: fakeId('batch') })) }, error: null, headers: null } as BatchResult;
  }) as Resend['batch']['send'];

  // Forwarding an inbound reply sends mail to the advance watchers. Off the
  // production site it's never forwarded, test address or not.
  client.emails.receiving.forward = (async (payload: ForwardPayload) => {
    logBlocked('email forward', { recipients: recipientCount(payload.to) });
    return { data: { id: fakeId('forward') }, error: null, headers: null } as unknown as ForwardResult;
  }) as Resend['emails']['receiving']['forward'];

  return client;
}
