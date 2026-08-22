import { sql } from '@/lib/db';
import PhotographersList, { type PhotographerListItem } from '@/components/admin/PhotographersList';

export const dynamic = 'force-dynamic';

async function getPhotographers(): Promise<PhotographerListItem[]> {
  const rows = await sql<PhotographerListItem[]>`
    select p.id, p.name, p.photo, p.instagram, p.contact_email,
      (select count(*)::int from settlements st
        where lower(trim(st.photographer_name)) = lower(trim(p.name))) as show_count
    from photographers p
    order by p.name asc
  `;
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export default async function AdminPhotographersPage() {
  const photographers = await getPhotographers();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <PhotographersList initialPhotographers={photographers} />
    </main>
  );
}
