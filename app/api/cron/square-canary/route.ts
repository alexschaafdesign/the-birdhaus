import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendAdminAlertEmail } from '@/lib/alerts';
import { createTierPaymentLink, deletePaymentLink, isSquareSyncEnabled } from '@/lib/square';
import { getTodayCentral } from '@/lib/shows';

// Daily checkout canary. The Into It, Over It scare was a *detection* failure:
// ticket links served a fake "payment confirmed" receipt for days and nobody
// knew. This cron walks the exact code path a buyer's click takes — mint a
// fresh Square payment link for the next upcoming show's cheapest tier, check
// the hosted checkout URL answers, then delete the link (which also cancels its
// draft order, so daily canaries never accumulate in Square). Any failure
// emails the admin and returns 500 so the run shows failed in Vercel's cron
// dashboard. Scheduled by the `crons` entry in vercel.json; auth is the same
// `Authorization: Bearer <CRON_SECRET>` check as the other crons.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dev/preview never touch live Square (there is no Sandbox).
  if (!isSquareSyncEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'square sync disabled' });
  }

  // Target: the next upcoming show's cheapest tier — the link buyers are most
  // likely to click next. No upcoming synced shows → nothing to protect.
  const [target] = await sql<{ variationId: string; slug: string }[]>`
    select l.square_variation_id as "variationId", s.slug
    from show_square_links l
    join shows s on s.id = l.show_id
    where s.date >= ${getTodayCentral()} and l.square_variation_id is not null
    order by s.date asc, l.amount_cents asc
    limit 1
  `;
  if (!target) {
    return NextResponse.json({ ok: true, skipped: 'no upcoming show links' });
  }

  let stage = 'mint';
  let paymentLinkId: string | null = null;
  let deleteWarning: string | null = null;

  // Clean up the test link. Runs at most once (nulls the id first); a delete
  // failure is a warning (logged + surfaced), not a canary failure.
  const cleanupLink = async () => {
    if (!paymentLinkId) return;
    const id = paymentLinkId;
    paymentLinkId = null;
    try {
      await deletePaymentLink(id);
    } catch (err) {
      deleteWarning = String(err);
      console.warn(`[square-canary] could not delete canary link ${id}`, err);
    }
  };

  try {
    // The exact buyer code path — same function /shows/[slug]/checkout calls.
    const link = await createTierPaymentLink(target.variationId, 1);
    if (!link?.url) throw new Error('mint returned no url');
    paymentLinkId = link.paymentLinkId;

    // The hosted checkout must answer. No body sniffing — Square's markup isn't
    // a stable contract; reachability of a fresh link is the signal.
    stage = 'fetch checkout page';
    const res = await fetch(link.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`checkout page returned ${res.status}`);

    // Delete before responding so the response can report a delete warning.
    await cleanupLink();
    return NextResponse.json({
      ok: true,
      show: target.slug,
      ...(deleteWarning ? { deleteWarning } : {}),
    });
  } catch (err) {
    console.error(`[square-canary] FAILED at stage "${stage}"`, err);
    try {
      await sendAdminAlertEmail('Ticket checkout canary FAILED', [
        `Stage: ${stage}`,
        `Show tested: ${target.slug}`,
        `Error: ${String(err)}`,
        '',
        'Buyers may be unable to buy tickets right now.',
        'Check Square status and SQUARE_ACCESS_TOKEN, then re-run the canary.',
      ]);
    } catch (alertErr) {
      console.error('[square-canary] alert email failed', alertErr);
    }
    return NextResponse.json({ ok: false, stage, error: String(err) }, { status: 500 });
  } finally {
    // No-op if the success path already cleaned up.
    await cleanupLink();
  }
}
