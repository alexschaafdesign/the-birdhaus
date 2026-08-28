import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { retrieveOrderLines } from '@/lib/square';
import { sendTicketConfirmationEmail } from '@/lib/ticket-email';
import { SITE_URL } from '@/lib/site';

// Square payment webhook → our own ticket_purchases table. This is how the site
// owns its sales data instead of re-polling Square's payments API ad hoc: every
// COMPLETED payment whose order contains one of our shows' catalog variations
// gets a row, and the buyer gets a "you're locked in" confirmation email.
//
// Registered in the Square Developer Dashboard (events: payment.updated +
// refund.updated) pointing at ${SITE_URL}/api/webhooks/square. Signature is
// base64 HMAC-SHA256 over (notification_url + raw_body) keyed by the
// subscription's signature key — so the raw body must never be re-serialized,
// and the URL string must byte-match what's registered (override with
// SQUARE_WEBHOOK_NOTIFICATION_URL if they ever differ).
//
// Deliberately NOT under /api/admin: proxy.ts must not gate it (same as
// resend-inbound). Response policy: 200 ACK for anything we don't care about so
// Square stops retrying; 401 only for bad signatures; 500 only for transient
// failures where a retry can succeed (Square retries with backoff for ~24h).

export const dynamic = 'force-dynamic';

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  buyer_email_address?: string;
  amount_money?: { amount?: number };
  created_at?: string;
};

function verifySignature(rawBody: string, signature: string | null, key: string): boolean {
  if (!signature) return false;
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ?? `${SITE_URL}/api/webhooks/square`;
  const expected = createHmac('sha256', key).update(notificationUrl + rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function POST(request: Request) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) {
    console.error('[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Raw body — parsing then re-serializing would break the HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');
  if (!verifySignature(rawBody, signature, signatureKey)) {
    console.warn('[square-webhook] invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: true }); // signed but malformed — ACK, don't retry
  }
  const type = event.type ?? '';

  // Refunds: flip the matching purchase to 'refunded' so admin revenue stays
  // honest. Any refund (even partial) marks the whole purchase — no partial math.
  if (type.startsWith('refund.')) {
    const refund = event.data?.object?.refund as { payment_id?: string } | undefined;
    if (refund?.payment_id) {
      await sql`
        update ticket_purchases set status = 'refunded'
        where square_payment_id = ${refund.payment_id}
      `;
      // A refund can drop a show back below its cap — regenerate show pages so a
      // sold-out notice clears (and the tickets count updates).
      revalidatePath('/shows/[slug]', 'page');
    }
    return NextResponse.json({ ok: true });
  }

  const payment = event.data?.object?.payment as SquarePayment | undefined;
  if (!type.startsWith('payment.') || !payment?.id || payment.status !== 'COMPLETED' || !payment.order_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Map payment → show: the order's line items carry the catalog variation ids
  // that show_square_links ties to a show. A transient retrieve failure gets a
  // 500 so Square redelivers and we pick the row up on a later attempt.
  let match: { showId: number; variationId: string; quantity: number } | undefined;
  try {
    const lines = await retrieveOrderLines(payment.order_id);
    const variationIds = lines.map((l) => l.catalogObjectId).filter((v): v is string => Boolean(v));
    if (variationIds.length > 0) {
      const rows = await sql<{ showId: number; variationId: string }[]>`
        select show_id as "showId", square_variation_id as "variationId"
        from show_square_links
        where square_variation_id in ${sql(variationIds)} and show_id is not null
        limit 1
      `;
      if (rows[0]) {
        const line = lines.find((l) => l.catalogObjectId === rows[0].variationId);
        match = { showId: rows[0].showId, variationId: rows[0].variationId, quantity: line?.quantity ?? 1 };
      }
    }
  } catch (err) {
    // Permanent failures — an order we can never fetch (Square's "Send test
    // event" uses a canned order from a different merchant → 403; a deleted or
    // bogus order → 404). Retrying cannot succeed, so ACK instead of making
    // Square hammer us for 24h. squareFetch encodes the status in its message.
    const msg = String(err);
    if (msg.includes('failed: 403') || msg.includes('failed: 404')) {
      console.warn(`[square-webhook] order ${payment.order_id} unfetchable (permanent) — ignoring`, err);
      return NextResponse.json({ ok: true, ignored: true });
    }
    console.error(`[square-webhook] order retrieve failed for payment ${payment.id}`, err);
    return NextResponse.json({ error: 'Order retrieve failed' }, { status: 500 });
  }
  if (!match) {
    // A Square sale that isn't one of our show tiers (merch, misc) — not ours.
    return NextResponse.json({ ok: true, ignored: true });
  }

  await sql`
    insert into ticket_purchases (
      show_id, square_payment_id, square_order_id, square_variation_id,
      amount_cents, quantity, buyer_email, payment_created_at, raw, source
    ) values (
      ${match.showId}, ${payment.id}, ${payment.order_id}, ${match.variationId},
      ${payment.amount_money?.amount ?? 0}, ${match.quantity},
      ${payment.buyer_email_address ?? null},
      ${payment.created_at ?? null}, cast(${JSON.stringify(payment)} as jsonb), 'webhook'
    )
    on conflict (square_payment_id) do nothing
  `;

  // A new sale may have crossed the show's ticket cap — regenerate the (static)
  // show pages so the RSVP form flips to the sold-out notice without a redeploy.
  revalidatePath('/shows/[slug]', 'page');

  // Confirmation email, idempotent via claim-first: mark the row before sending
  // so a webhook redelivery can never double-email. Backfilled rows are excluded
  // (source + pre-stamped sent_at), as are payments without a buyer email.
  const [claimed] = await sql<
    { showId: number; buyerEmail: string; quantity: number; amountCents: number }[]
  >`
    update ticket_purchases set confirmation_email_sent_at = now()
    where square_payment_id = ${payment.id}
      and confirmation_email_sent_at is null
      and source = 'webhook'
      and buyer_email is not null
      and show_id is not null
    returning show_id as "showId", buyer_email as "buyerEmail",
      quantity, amount_cents as "amountCents"
  `;
  if (claimed) {
    try {
      const [show] = await sql<
        { title: string; date: string; doorsTime: string | null; showTime: string | null; slug: string }[]
      >`
        select title, date::text as date, doors_time as "doorsTime",
          show_time as "showTime", slug
        from shows where id = ${claimed.showId}
      `;
      if (show) {
        await sendTicketConfirmationEmail({
          to: claimed.buyerEmail,
          showTitle: show.title,
          showDate: show.date,
          doorsTime: show.doorsTime,
          showTime: show.showTime,
          slug: show.slug,
          quantity: claimed.quantity,
          amountCents: claimed.amountCents,
        });
      }
    } catch (err) {
      // Never fail the webhook over email — the purchase row is already safe.
      console.error(`[square-webhook] confirmation email failed for payment ${payment.id}`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
