import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import ShowTabs from '@/components/admin/ShowTabs';
import ShowPrevNav, { type ShowNeighbor } from '@/components/admin/ShowPrevNav';

// Short "Mon D · First Band" label for a prev/next neighbor. Titles are usually
// "Band A / Band B / Band C", so keep only the first band to stay compact; a title
// with no slash is used as-is.
function neighborLabel(row: { title: string; date: string | null }): string {
  const firstBand = row.title.split('/')[0].trim() || row.title;
  const date = row.date
    ? new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  return date ? `${date} · ${firstBand}` : firstBand;
}

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

  // Chronological neighbors (by date, then id) for prev/next navigation. Only
  // computed when this show has a date; null-dated shows are ignored on both ends.
  let prev: ShowNeighbor | null = null;
  let next: ShowNeighbor | null = null;
  if (show.date) {
    const [[p], [n]] = await Promise.all([
      sql<{ id: number; title: string; date: string | null }[]>`
        select id, title, date::text as date from shows
        where date is not null and (date, id) < (${show.date}::date, ${showId})
        order by date desc, id desc limit 1
      `,
      sql<{ id: number; title: string; date: string | null }[]>`
        select id, title, date::text as date from shows
        where date is not null and (date, id) > (${show.date}::date, ${showId})
        order by date asc, id asc limit 1
      `,
    ]);
    prev = p ? { id: Number(p.id), label: neighborLabel(p) } : null;
    next = n ? { id: Number(n.id), label: neighborLabel(n) } : null;
  }

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
        <ShowPrevNav currentId={showId} prev={prev} next={next} />
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
