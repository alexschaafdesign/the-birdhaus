import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import ShowTabs from '@/components/admin/ShowTabs';

export const dynamic = 'force-dynamic';

// Per-show workspace shell: title + tab nav shared across the Details,
// Settlement, and RSVPs tabs. Each tab renders its own content into {children}.
export default async function ShowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string; date: string | null }[]>`
    select id, title, date::text as date from shows where id = ${showId}
  `;
  if (!show) notFound();

  // At-a-glance progress for the tab bar so the workspace reads as a checklist:
  // whether the invite went out, how many bands have submitted inputs, the RSVP
  // headcount, and whether a settlement's been saved. One cheap round-trip;
  // each subquery degrades to 0/false if that subsystem has no rows yet.
  const [counts] = await sql<
    {
      invite_sent: boolean;
      band_total: number;
      bands_with_inputs: number;
      rsvp_count: number;
      settlement_saved: boolean;
    }[]
  >`
    select
      exists(select 1 from show_advances where show_id = ${showId} and status = 'sent') as invite_sent,
      (select count(*)::int from show_bands sb where sb.show_id = ${showId} and not sb.excluded) as band_total,
      (select count(distinct band_id)::int from show_input_items where show_id = ${showId}) as bands_with_inputs,
      (select count(*)::int from rsvps where show_id = ${showId}) as rsvp_count,
      exists(select 1 from settlements where show_id = ${showId}) as settlement_saved
  `;
  const badges = {
    inviteSent: counts?.invite_sent ?? false,
    inputs:
      counts && counts.band_total > 0
        ? { done: counts.bands_with_inputs, total: counts.band_total }
        : null,
    rsvpCount: counts?.rsvp_count ?? 0,
    settlementSaved: counts?.settlement_saved ?? false,
  };

  const prettyDate = show.date
    ? new Date(`${show.date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/shows"
          className="inline-flex items-center gap-1 text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors"
        >
          ← Back to shows
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{show.title}</h1>
          {prettyDate && <p className="text-sm text-[#E8E0D0]/50">{prettyDate}</p>}
        </div>
        <ShowTabs id={showId} badges={badges} />
      </div>
      {children}
    </main>
  );
}
