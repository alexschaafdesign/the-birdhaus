import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import ShowTabs from '@/components/admin/ShowTabs';
import { getOneShowHealth } from '@/lib/show-health-data';
import { todosByTab } from '@/lib/show-health';
import { getTodayCentral } from '@/lib/shows';
import ShowPrevNav, { type ShowNeighbor } from '@/components/admin/ShowPrevNav';
import ShowOverview from '@/components/admin/ShowOverview';

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

// Per-show workspace shell: title + tab nav shared across the show's tabs. Each tab renders its own content into {children}.
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

  // Open to-dos per tab (lib/show-health — the same issues the shows list and
  // the Overview checklist show) for the dots on the tab bar.
  // …and the status strip above the tabs (same issues), plus the few names and
  // counts it shows alongside them.
  const [facts, [crew]] = await Promise.all([
    getOneShowHealth(showId),
    sql<
      {
        confirmed_engineer: string | null;
        door_person_name: string | null;
        photographer_name: string | null;
        active_band_count: number;
        bands_with_inputs: number;
        settlement_saved: boolean;
      }[]
    >`
      select
        (select se.name from show_sound_engineers sse
           join sound_engineers se on se.id = sse.sound_engineer_id
           where sse.show_id = s.id and sse.status = 'confirmed' limit 1) as confirmed_engineer,
        s.door_person_name,
        (select p.name from photographers p where p.id = s.photographer_id) as photographer_name,
        (select count(*)::int from show_bands where show_id = s.id and not excluded) as active_band_count,
        (select count(distinct band_id)::int from show_input_items where show_id = s.id) as bands_with_inputs,
        exists(select 1 from settlements where show_id = s.id) as settlement_saved
      from shows s where s.id = ${showId}
    `,
  ]);
  const today = getTodayCentral();
  const todos = facts ? todosByTab(facts, today) : {};

  const prettyDate = show.date
    ? new Date(`${show.date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // max-w-6xl matches the dashboard shell's nav width so the show workspace
  // lines up with the admin nav links above it.
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin/shows"
            className="inline-flex items-center gap-1 text-body-3 opacity-60 hover:underline hover:opacity-100"
          >
            ← Back to shows
          </Link>
          <ShowPrevNav currentId={showId} prev={prev} next={next} />
        </div>
        <div>
          <h1 className="text-header-3 font-bold leading-tight">{show.title}</h1>
          {prettyDate && <p className="text-body-3 opacity-60">{prettyDate}</p>}
        </div>
        {facts && crew && (
          <ShowOverview
            showId={showId}
            facts={facts}
            today={today}
            confirmedEngineer={crew.confirmed_engineer}
            doorPerson={crew.door_person_name?.trim() || null}
            photographerName={crew.photographer_name}
            bandsWithInputs={crew.bands_with_inputs}
            activeBandCount={crew.active_band_count}
            settlementSaved={crew.settlement_saved}
          />
        )}
        <ShowTabs id={showId} todos={todos} />
      </div>
      {children}
    </main>
  );
}
