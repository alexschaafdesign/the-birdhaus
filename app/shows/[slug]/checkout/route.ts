import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { claimAlertSlot, sendAdminAlertEmail } from '@/lib/alerts';
import { createTierPaymentLink, isSquareSyncEnabled } from '@/lib/square';
import { getTicketAvailability } from '@/lib/shows';

// On-demand Square checkout. Square API payment links are single-use — a stored
// link shows a "payment confirmed" receipt to everyone after its first sale — so
// rather than sending buyers to a static per-tier link, the /tickets buttons
// point here and we mint a fresh link per click, then 302 to it. Unlimited
// buyers, and the order keeps the tier's catalog variation so getShowPurchases
// still reconciles who paid.
//
// The tier is identified by amount (cents) so we resolve the show's catalog
// variation server-side — we never trust a variation id supplied in the URL.
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const searchParams = new URL(request.url).searchParams;
  const amount = Number(searchParams.get('tier'));
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }
  // Optional party size chosen on /tickets. Square's checkout page has no quantity
  // field, so we bake it into the order. Clamp to 1..10 (createTierPaymentLink also
  // clamps); default to 1 when absent or garbage.
  const qtyRaw = Number(searchParams.get('qty'));
  const quantity = Number.isInteger(qtyRaw) && qtyRaw > 0 ? Math.min(qtyRaw, 10) : 1;

  const [row] = await sql<
    { showId: number; ticketLimit: number | null; variationId: string | null; url: string | null }[]
  >`
    select s.id as "showId", s.ticket_limit as "ticketLimit",
           l.square_variation_id as "variationId", l.url
    from show_square_links l
    join shows s on s.id = l.show_id
    where s.slug = ${slug} and l.amount_cents = ${amount}
    order by l.id desc
    limit 1
  `;
  if (!row) {
    return NextResponse.json({ error: 'Ticket tier not found' }, { status: 404 });
  }

  // Enforce the online ticket cap (if the show has one) BEFORE minting a Square
  // link, so a sold-out show never sends anyone to a checkout page. Best-effort
  // soft cap: Square's hosted checkout completes the sale later, so simultaneous
  // buyers can still slip past a near-full cap — acceptable at this scale.
  if (typeof row.ticketLimit === 'number') {
    const { remaining } = await getTicketAvailability(row.showId, row.ticketLimit);
    if (remaining !== null && remaining < quantity) {
      const back = new URL(`/shows/${slug}/tickets`, request.url);
      back.searchParams.set(remaining <= 0 ? 'sold_out' : 'left', String(Math.max(0, remaining)));
      return NextResponse.redirect(back, 302);
    }
  }

  // Dev / Square disabled: there's no live API to mint a link, so fall back to
  // the (possibly single-use) stored link if we have one.
  if (!isSquareSyncEnabled()) {
    if (row.url) return NextResponse.redirect(row.url, 302);
    return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
  }

  // Buyer-facing failures land back on the tickets page with a friendly banner
  // (never raw JSON — a real person clicked this).
  const errorRedirect = () =>
    NextResponse.redirect(new URL(`/shows/${slug}/tickets?checkout_error=1`, request.url), 302);

  if (!row.variationId) {
    return errorRedirect();
  }

  try {
    const link = await createTierPaymentLink(row.variationId, quantity);
    if (!link) {
      return errorRedirect();
    }
    return NextResponse.redirect(link.url, 302);
  } catch (err) {
    console.error(`[square] on-demand checkout failed for ${slug} tier ${amount}`, err);
    // Alert the admin (max one email/hour across all lambdas) — a mint failure
    // here means a real buyer just couldn't buy. Alerting must never mask the
    // buyer-facing redirect, so it gets its own try/catch.
    try {
      if (await claimAlertSlot('checkout-mint-failure')) {
        await sendAdminAlertEmail(`Checkout is failing: could not mint Square link (${slug})`, [
          `Show: ${slug}`,
          `Tier: ${amount}¢ · qty ${quantity}`,
          `Error: ${String(err)}`,
          '',
          'A buyer just hit this. Check Square status and SQUARE_ACCESS_TOKEN.',
          'The daily canary cron may fire too. Throttled to one of these emails per hour.',
        ]);
      }
    } catch (alertErr) {
      console.error('[square] mint-failure alert failed', alertErr);
    }
    return errorRedirect();
  }
}
