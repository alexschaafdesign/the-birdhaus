import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getRsvpsForShow } from '@/lib/rsvps';
import { getShowPurchaseMatches } from '@/lib/square';
import { getOrCreateDoorToken } from '@/lib/door-token';
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

  // Lazily mint the kiosk token so the "Door check-in" link resolves the first
  // time the host opens this tab.
  const doorToken = await getOrCreateDoorToken(showId);

  // Match Square donation purchases to this show, then to people by email.
  // Best-effort: returns empty matches if Square is off or the show was never synced.
  const { purchasesByEmail, unmatchedBuyers } = await getShowPurchaseMatches(
    showId,
    rsvpSummary.rsvps.map((r) => r.email),
  );

  return (
    <RsvpSummary
      showId={show.id}
      showTitle={show.title}
      showDate={show.date}
      doorToken={doorToken}
      {...rsvpSummary}
      purchasesByEmail={purchasesByEmail}
      unmatchedBuyers={unmatchedBuyers}
    />
  );
}
