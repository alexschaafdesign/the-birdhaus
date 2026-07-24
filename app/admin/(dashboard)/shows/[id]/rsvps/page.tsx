import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getRsvpsForShow } from '@/lib/rsvps';
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

  return <RsvpSummary showId={show.id} showTitle={show.title} showDate={show.date} {...rsvpSummary} />;
}
