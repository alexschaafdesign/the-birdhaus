import { sql } from '@/lib/db';
import ShowsList, { type ShowListItem } from '@/components/admin/ShowsList';

export const dynamic = 'force-dynamic';

async function getShows(): Promise<ShowListItem[]> {
  const rows = await sql<
    ShowListItem[]
  >`select id, slug, title, date::text as date, announced from shows order by date desc`;
  return rows;
}

export default async function AdminShowsPage() {
  const shows = await getShows();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <ShowsList initialShows={shows} />
    </main>
  );
}
