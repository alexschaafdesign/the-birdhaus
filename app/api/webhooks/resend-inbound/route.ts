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
    // The envelope recipient(s) the message was actually delivered to — this is
    // where our advance-{token}@... address reliably lands, even when the raw To
    // header (event.data.to) lists something else (e.g. a reply-all to the other
    // bands, or the address with a display name). Scanned first for the token.
    received_for?: string[];
    cc?: string[];
    bcc?: string[];
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
  } catch (e) {
    // Wrong/rotated secret is a silent killer — every reply 401s and vanishes.
    // Log so it's visible in prod function logs instead of failing invisibly.
    console.error('[resend-inbound] signature verification failed', e);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Ignore anything that isn't an inbound email — ack so Resend stops retrying.
  if (event.type !== 'email.received' || !event.data?.email_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Which show? Encoded in the advance-{token}@... recipient address. Check the
  // envelope recipient (received_for) first — the most reliable source — then the
  // header recipients. A reply-all puts the group address in To; a plain reply
  // may only surface it in received_for.
  const toList = event.data.to ?? [];
  const recipientCandidates = [
    ...(event.data.received_for ?? []),
    ...toList,
    ...(event.data.cc ?? []),
    ...(event.data.bcc ?? []),
  ];
  let token: string | null = null;
  for (const addr of recipientCandidates) {
    token = parseReplyToken(addr);
    if (token) break;
  }
  if (!token) {
    // Not one of our advance threads (or the address didn't parse); ack and move
    // on, but log the recipients so a genuinely-missed reply can be diagnosed.
    console.warn(
      '[resend-inbound] no advance token in recipients',
      JSON.stringify({
        from: event.data.from,
        to: toList,
        received_for: event.data.received_for,
      })
    );
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

  if (!result.matched) {
    // Token was well-formed but no show_advances row has it — most often a token
    // minted in a different environment/DB than the one receiving the webhook
    // (e.g. advance sent from a preview deploy, webhook hitting prod).
    console.warn('[resend-inbound] token had no matching advance', token);
  }

  return NextResponse.json({ ok: true, matched: result.matched });
}
