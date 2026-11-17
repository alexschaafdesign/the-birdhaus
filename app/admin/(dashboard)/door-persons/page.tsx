import { sql } from '@/lib/db';
import DoorPersonsList, { type DoorPersonListItem } from '@/components/admin/DoorPersonsList';

export const dynamic = 'force-dynamic';

async function getDoorPersons(): Promise<DoorPersonListItem[]> {
  const rows = await sql<DoorPersonListItem[]>`
    select p.id, p.name, p.photo, p.instagram, p.contact_email,
      (select count(*)::int from settlements st
        where lower(trim(st.door_person_name)) = lower(trim(p.name))) as show_count
    from door_persons p
    order by p.name asc
  `;
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export default async function AdminDoorPersonsPage() {
  const doorPersons = await getDoorPersons();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <DoorPersonsList initialDoorPersons={doorPersons} />
    </main>
  );
}
