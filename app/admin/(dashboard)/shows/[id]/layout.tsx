import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import ShowTabs from '@/components/admin/ShowTabs';
import { getOneShowHealth } from '@/lib/show-health-data';
import { todosByTab } from '@/lib/show-health';
import { getTodayCentral } from '@/lib/shows';
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
  const facts = await getOneShowHealth(showId);
  const todos = facts ? todosByTab(facts, getTodayCentral()) : {};

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
        <ShowTabs id={showId} todos={todos} />
      </div>
      {children}
    </main>
  );
}
