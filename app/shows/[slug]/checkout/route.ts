import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createTierPaymentLink, isSquareSyncEnabled } from '@/lib/square';

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
  const amount = Number(new URL(request.url).searchParams.get('tier'));
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const [row] = await sql<{ variationId: string | null; url: string | null }[]>`
    select l.square_variation_id as "variationId", l.url
    from show_square_links l
    join shows s on s.id = l.show_id
    where s.slug = ${slug} and l.amount_cents = ${amount}
    order by l.id desc
    limit 1
  `;
  if (!row) {
    return NextResponse.json({ error: 'Ticket tier not found' }, { status: 404 });
  }

  // Dev / Square disabled: there's no live API to mint a link, so fall back to
  // the (possibly single-use) stored link if we have one.
  if (!isSquareSyncEnabled()) {
    if (row.url) return NextResponse.redirect(row.url, 302);
    return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
  }

  if (!row.variationId) {
    return NextResponse.json({ error: 'Checkout unavailable for this tier' }, { status: 503 });
  }

  try {
    const link = await createTierPaymentLink(row.variationId);
    if (!link) {
      return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
    }
    return NextResponse.redirect(link.url, 302);
  } catch (err) {
    console.error(`[square] on-demand checkout failed for ${slug} tier ${amount}`, err);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 });
  }
}
