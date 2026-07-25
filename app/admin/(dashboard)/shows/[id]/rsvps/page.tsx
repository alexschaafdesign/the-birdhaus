import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getRsvpsForShow } from '@/lib/rsvps';
import { getShowPurchases } from '@/lib/square';
import RsvpSummary from '@/components/admin/RsvpSummary';

export const dynamic = 'force-dynamic';

export default async function ShowRsvpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string; date: string }[]>`
    select id, title, date::text as date from shows where id = ${showId}
  `;
  if (!show) notFound();

  const rsvpSummary = await getRsvpsForShow(showId);

  // Match Square donation purchases to this show via its variation IDs, then to
  // people by email. Best-effort: getShowPurchases returns [] if Square is off
  // or the show was never synced.
  const links = await sql<{ variationId: string | null; createdAt: string }[]>`
    select square_variation_id as "variationId", created_at as "createdAt"
    from show_square_links
    where show_id = ${showId}
  `;
  const variationIds = links.map((l) => l.variationId).filter((v): v is string => Boolean(v));

  const purchasesByEmail: Record<string, { totalCents: number; count: number }> = {};
  const unmatchedBuyers: { email: string; amountCents: number; purchasedAt: string }[] = [];

  if (variationIds.length > 0) {
    // Only scan payments from when the links were created through a few days
    // after the show — keeps the Square sweep tight.
    const earliest = links.reduce<string | null>(
      (min, l) => (l.createdAt && (!min || l.createdAt < min) ? l.createdAt : min),
      null,
    );
    const showMidnight = new Date(show.date + 'T00:00:00').getTime();
    const since = earliest ? new Date(earliest) : new Date(showMidnight - 120 * 86_400_000);
    const until = new Date(showMidnight + 3 * 86_400_000);

    const purchases = await getShowPurchases(variationIds, { since, until });
    const rsvpEmails = new Set(rsvpSummary.rsvps.map((r) => r.email.toLowerCase()));
    for (const p of purchases) {
      const email = p.email?.toLowerCase() ?? '';
      if (email && rsvpEmails.has(email)) {
        const cur = purchasesByEmail[email] ?? { totalCents: 0, count: 0 };
        purchasesByEmail[email] = { totalCents: cur.totalCents + p.amountCents, count: cur.count + 1 };
      } else {
        unmatchedBuyers.push({
          email: p.email ?? '(no email)',
          amountCents: p.amountCents,
          purchasedAt: p.purchasedAt,
        });
      }
    }
  }

  return (
    <RsvpSummary
      showId={show.id}
      showTitle={show.title}
      showDate={show.date}
      {...rsvpSummary}
      purchasesByEmail={purchasesByEmail}
      unmatchedBuyers={unmatchedBuyers}
    />
  );
}
