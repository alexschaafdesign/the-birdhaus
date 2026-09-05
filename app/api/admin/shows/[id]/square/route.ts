import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { syncShowToSquare, attachShowFlyerToSquare, isSquareSyncEnabled } from '@/lib/square';
import { SITE_URL } from '@/lib/site';
import { requireAdmin } from '@/lib/admin-session';

// Manual, admin-triggered Square sync for a single show (the "Create Square
// links" button on the Edit form). Create-once for the item + payment links; a
// missing flyer can be attached on a later click once the show has one.

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

type LinkRow = { tierLabel: string; amountCents: number; url: string | null };

async function loadLinks(showId: number): Promise<LinkRow[]> {
  return sql<LinkRow[]>`
    select tier_label as "tierLabel", amount_cents as "amountCents", url
    from show_square_links
    where show_id = ${showId}
    order by amount_cents
  `;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const [show] = await sql`
    select id, slug, title, date::text as date, doors_time, show_time, flyer,
           square_item_id, square_image_id
    from shows
    where id = ${showId}
  `;
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  if (!isSquareSyncEnabled()) {
    return NextResponse.json({ status: 'disabled', links: await loadLinks(showId) });
  }

  // Ticket URL points at our own donation-tier page (which links out to each
  // Square checkout) — one link that works everywhere ticket_url is used.
  const ticketUrl = `${SITE_URL}/shows/${show.slug}/tickets`;

  try {
    // First time: create the item + variations + payment links (+ flyer if present).
    if (!show.square_item_id) {
      const result = await syncShowToSquare({
        id: show.id,
        title: show.title,
        date: show.date,
        doors_time: show.doors_time,
        show_time: show.show_time,
        flyer: show.flyer,
      });
      if (!result) {
        return NextResponse.json({ status: 'disabled', links: await loadLinks(showId) });
      }
      await sql`
        update shows
        set square_item_id = ${result.itemId},
            square_image_id = ${result.imageId},
            ticket_url = ${ticketUrl}
        where id = ${showId}
      `;
      for (const tier of result.tiers) {
        await sql`
          insert into show_square_links (
            show_id, tier_label, amount_cents,
            square_variation_id, square_payment_link_id, square_order_id, url
          )
          values (
            ${showId}, ${tier.tierLabel}, ${tier.amountCents},
            ${tier.variationId}, ${tier.paymentLinkId}, ${tier.orderId}, ${tier.url}
          )
        `;
      }
      return NextResponse.json({
        status: 'created',
        itemId: result.itemId,
        imageId: result.imageId,
        ticketUrl,
        links: await loadLinks(showId),
      });
    }

    // Already created (create-once). Keep ticket_url pointed at the tiers page
    // (e.g. if the slug changed since the last sync).
    await sql`update shows set ticket_url = ${ticketUrl} where id = ${showId}`;

    // Backfill the flyer if it wasn't attached yet.
    if (!show.square_image_id) {
      if (!show.flyer) {
        return NextResponse.json({
          status: 'no_flyer',
          itemId: show.square_item_id,
          imageId: null,
          ticketUrl,
          links: await loadLinks(showId),
        });
      }
      const imageId = await attachShowFlyerToSquare(
        { id: show.id, title: show.title, date: show.date, flyer: show.flyer },
        show.square_item_id,
      );
      await sql`update shows set square_image_id = ${imageId} where id = ${showId}`;
      return NextResponse.json({
        status: 'flyer_attached',
        itemId: show.square_item_id,
        imageId,
        ticketUrl,
        links: await loadLinks(showId),
      });
    }

    return NextResponse.json({
      status: 'exists',
      itemId: show.square_item_id,
      imageId: show.square_image_id,
      ticketUrl,
      links: await loadLinks(showId),
    });
  } catch (err) {
    console.error(`[square] sync action failed for show ${showId}`, err);
    const message = err instanceof Error ? err.message : 'Square sync failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
