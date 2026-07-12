import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { type ShowListItem } from '@/components/admin/ShowsList';
import AdminShowsBrowser from '@/components/admin/ShowsBrowser';

export const dynamic = 'force-dynamic';

async function getShows(): Promise<ShowListItem[]> {
  const rows = await sql<
    ShowListItem[]
  >`select id, slug, title, date::text as date, announced, flyer from shows order by date desc`;
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
