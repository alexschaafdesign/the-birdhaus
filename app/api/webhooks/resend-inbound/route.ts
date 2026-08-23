import { NextResponse } from 'next/server';
import type { Resend } from 'resend';
import {
  getResendClient,
  parseReplyToken,
  extractEmailAddress,
} from '@/lib/advance-email';
import { recordInboundReply, type InboundAttachmentInput } from '@/lib/advance';
import { getAdvanceWatchers } from '@/lib/advance-watchers';

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
    // Attachment metadata only — no bytes and no download URL. To get the file
    // we fetch a signed URL per attachment via the receiving-attachments API.
    attachments?: Array<{
      id?: string;
      filename?: string | null;
      content_type?: string;
      content_disposition?: string | null;
    }>;
  };
}

// Downloads each real (non-inline) attachment on an inbound email and returns
// its bytes for re-hosting. Inline-disposition parts are skipped: those are
// embedded body images (email-signature logos, etc.), not files a band sent.
// Per-attachment failures are logged and skipped so one bad file never drops the
// whole reply. The signed download URL from Resend is short-lived — we fetch the
// bytes now and hand them off to be stored durably in R2.
async function fetchInboundAttachments(
  resend: Resend,
  emailId: string,
  metas: NonNullable<InboundEvent['data']>['attachments']
): Promise<InboundAttachmentInput[]> {
  const out: InboundAttachmentInput[] = [];
  for (const meta of metas ?? []) {
    if (!meta.id) continue;
    if (meta.content_disposition === 'inline') continue;
    try {
      const signed = await resend.emails.receiving.attachments.get({
        emailId,
        id: meta.id,
      });
      if (signed.error || !signed.data?.download_url) {
        console.error(
          '[resend-inbound] could not get attachment download url',
          meta.id,
          JSON.stringify(signed.error)
        );
        continue;
      }
      const res = await fetch(signed.data.download_url);
      if (!res.ok) {
        console.error(
          '[resend-inbound] attachment download failed',
          meta.id,
          res.status
        );
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      out.push({
        resendAttachmentId: meta.id,
        filename: meta.filename ?? signed.data.filename ?? null,
        contentType: meta.content_type ?? signed.data.content_type ?? 'application/octet-stream',
        sizeBytes: buffer.length,
        buffer,
      });
    } catch (e) {
      console.error('[resend-inbound] error fetching attachment', meta.id, e);
    }
  }
  return out;
}

// Makes sure a reply reaches the watchers even when a band forgets to reply-all.
// Watchers are real recipients (CC'd on every outbound), so a reply-all lands in
// their inboxes directly — but a plain reply goes only to the group address. So
// we forward it, but only to watchers who weren't already on the message:
// reply-all → already copied → nothing forwarded (no duplicate); plain reply →
// gap filled. Deliberately forwards to watchers ONLY, never the sound engineer
// or bands — a band's plain reply may be private info they think is going just
// to the venue, so we don't fan it out. Best-effort: failures are logged, not
// thrown. Called once per reply (not on webhook retries).
async function forwardReplyIfMissed(
  resend: Resend,
  emailId: string,
  data: NonNullable<InboundEvent['data']>
): Promise<void> {
  const from = process.env.RESEND_ADVANCE_FROM_EMAIL;
  if (!from) {
    console.error('[resend-inbound] RESEND_ADVANCE_FROM_EMAIL not set; cannot forward reply');
    return;
  }

  // Addresses already on this reply (reply-all copies them). extractEmailAddress
  // lowercases + unwraps "Name <addr>" so casing never blocks a match.
  const alreadyOn = new Set(
    [...(data.to ?? []), ...(data.cc ?? []), ...(data.bcc ?? [])].map(extractEmailAddress)
  );
  const missed = (await getAdvanceWatchers()).filter(
    (w) => !alreadyOn.has(w.toLowerCase())
  );

  for (const to of missed) {
    try {
      const res = await resend.emails.receiving.forward({ emailId, to, from });
      if (res.error) {
        console.error('[resend-inbound] forward to inbox returned an error', JSON.stringify(res.error));
      }
    } catch (e) {
      console.error('[resend-inbound] error forwarding reply to inbox', e);
    }
  }
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

  // The webhook carries metadata only — fetch the body. The SDK returns API
  // errors in `error` (it does NOT throw), so check both: a swallowed error here
  // is exactly what leaves a reply stored with an empty body. Log the concrete
  // cause — a permission error means RESEND_API_KEY lacks receiving/read access.
  let html: string | null = null;
  let text: string | null = null;
  try {
    const full = await resend.emails.receiving.get(event.data.email_id);
    if (full.error) {
      console.error(
        '[resend-inbound] receiving.get returned an error',
        JSON.stringify(full.error)
      );
    } else {
      html = full.data?.html ?? null;
      text = full.data?.text ?? null;
      if (!html && !text) {
        console.warn(
          '[resend-inbound] received email fetched but had no html/text body',
          event.data.email_id
        );
      }
    }
  } catch (e) {
    // Still record the reply from metadata even if the body fetch throws.
    console.error('[resend-inbound] failed to fetch received email body', e);
  }

  // Pull down any real attachments (stage plots / input lists) so recordInboundReply
  // can re-host them in R2. Failures here are swallowed inside the helper.
  const attachments = await fetchInboundAttachments(
    resend,
    event.data.email_id,
    event.data.attachments
  );

  const result = await recordInboundReply({
    token,
    fromEmail: event.data.from ?? '',
    toEmails: toList,
    subject: event.data.subject ?? null,
    html,
    text,
    resendId: event.data.email_id,
    attachments,
  });

  if (!result.matched) {
    // Token was well-formed but no show_advances row has it — most often a token
    // minted in a different environment/DB than the one receiving the webhook
    // (e.g. advance sent from a preview deploy, webhook hitting prod).
    console.warn('[resend-inbound] token had no matching advance', token);
  } else if (!result.deduped) {
    // First time we've seen this reply — forward it to Alex if he wasn't already
    // reply-all'd. Guarded on !deduped so webhook retries don't re-forward.
    await forwardReplyIfMissed(resend, event.data.email_id, event.data);
  }

  return NextResponse.json({ ok: true, matched: result.matched });
}
