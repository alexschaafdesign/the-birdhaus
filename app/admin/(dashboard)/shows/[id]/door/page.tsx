import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getRsvpsForShow } from '@/lib/rsvps';
import { getShowPurchaseMatches } from '@/lib/square';
import { getOrCreateDoorToken } from '@/lib/door-token';
import Link from 'next/link';
import RsvpSummary from '@/components/admin/RsvpSummary';
import ShowTabTodos from '@/components/admin/ShowTabTodos';

export const dynamic = 'force-dynamic';

// The RSVPs tab: RSVPs and the door list, plus a pointer to
// this night's TV (which runs itself from the Overview's schedule).
export default async function ShowDoorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<
    { id: number; title: string; date: string; ticket_limit: number | null }[]
  >`
    select id, title, date::text as date, ticket_limit
    from shows where id = ${showId}
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
    rsvpSummary.rsvps.map((r) => ({ email: r.email, buyerEmail: r.buyer_email })),
  );

  return (
    <div className="space-y-8">
    <ShowTabTodos showId={showId} keys={['no-rsvps']} />
    <RsvpSummary
      showId={show.id}
      showTitle={show.title}
      showDate={show.date}
      ticketLimit={show.ticket_limit}
      doorToken={doorToken}
      {...rsvpSummary}
      purchasesByEmail={purchasesByEmail}
      unmatchedBuyers={unmatchedBuyers}
    />
    <p className="border-t border-surface-ink pt-4 text-data-caption-13 text-surface-ink/60 max-w-2xl">
      TV: on the night, the screen shows this show&apos;s schedule from the Advance tab automatically.{' '}
      <Link href={`/admin/shows/${showId}/tv`} className="underline underline-offset-2 hover:text-accent-red">
        Customize this night&apos;s TV →
      </Link>
    </p>
    </div>
  );
}
