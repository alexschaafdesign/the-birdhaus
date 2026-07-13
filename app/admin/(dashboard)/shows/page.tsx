import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { type ShowListItem } from '@/components/admin/ShowsList';
import AdminShowsBrowser from '@/components/admin/ShowsBrowser';

export const dynamic = 'force-dynamic';

async function getShows(): Promise<ShowListItem[]> {
  const rows = await sql<ShowListItem[]>`
    select
      s.id, s.slug, s.title, s.date::text as date, s.announced, s.flyer,
      coalesce(r.rsvp_count, 0)::int as rsvp_count,
      coalesce(r.guest_count, 0)::int as guest_count
    from shows s
    left join (
      select show_id, count(*) as rsvp_count, sum(guests) as guest_count
      from rsvps
      group by show_id
    ) r on r.show_id = s.id
    order by s.date desc
  `;
  return rows;
}

export default async function AdminShowsPage() {
  const shows = await getShows();
  const today = getTodayCentral();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <AdminShowsBrowser initialShows={shows} today={today} />
    </main>
  );
}
