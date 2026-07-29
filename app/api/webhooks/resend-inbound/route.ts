import { NextResponse } from 'next/server';
import { getResendClient, parseReplyToken } from '@/lib/advance-email';
import { recordInboundReply } from '@/lib/advance';

// Resend inbound webhook (email.received). NOT under /api/admin, so proxy.ts
// does not gate it — Resend reaches it unauthenticated, so we verify the Svix
// signature ourselves before trusting anything.
//
// The webhook payload is metadata only (from/to/subject/email_id); the reply
// body is fetched separately via the receiving-email API using email_id.

interface InboundEvent {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-inbound] RESEND_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Must verify against the RAW body — re-serializing parsed JSON breaks the
  // signature.
  const rawBody = await request.text();
  const headers = {
    id: request.headers.get('svix-id') ?? '',
    timestamp: request.headers.get('svix-timestamp') ?? '',
    signature: request.headers.get('svix-signature') ?? '',
  };

  const resend = getResendClient();
  let event: InboundEvent;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers,
      webhookSecret: secret,
    }) as InboundEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Ignore anything that isn't an inbound email — ack so Resend stops retrying.
  if (event.type !== 'email.received' || !event.data?.email_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Which show? Encoded in the advance-{token}@... recipient address.
  const toList = event.data.to ?? [];
  let token: string | null = null;
  for (const addr of toList) {
    token = parseReplyToken(addr);
    if (token) break;
  }
  if (!token) {
    // Not one of our advance threads; ack and move on.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // The webhook carries metadata only — fetch the body.
  let html: string | null = null;
  let text: string | null = null;
  try {
    const full = await resend.emails.receiving.get(event.data.email_id);
    html = full.data?.html ?? null;
    text = full.data?.text ?? null;
  } catch (e) {
    // Still record the reply from metadata even if the body fetch fails.
    console.error('[resend-inbound] failed to fetch received email body', e);
  }

  const result = await recordInboundReply({
    token,
    fromEmail: event.data.from ?? '',
    toEmails: toList,
    subject: event.data.subject ?? null,
    html,
    text,
    resendId: event.data.email_id,
  });

  return NextResponse.json({ ok: true, matched: result.matched });
}
