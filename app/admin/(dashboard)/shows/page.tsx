import { getShowHealthFacts } from '@/lib/show-health-data';
import { getTodayCentral } from '@/lib/shows';
import { type ShowListItem } from '@/components/admin/ShowsList';
import AdminShowsBrowser from '@/components/admin/ShowsBrowser';

export const dynamic = 'force-dynamic';

async function getShows(): Promise<ShowListItem[]> {
  return getShowHealthFacts();
}

export default async function AdminShowsPage() {
  const shows = await getShows();
  const today = getTodayCentral();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <AdminShowsBrowser initialShows={shows} today={today} />
    </main>
  );
}
