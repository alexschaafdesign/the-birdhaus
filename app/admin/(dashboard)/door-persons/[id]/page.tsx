import { notFound } from 'next/navigation';
import DoorPersonForm from '@/components/admin/DoorPersonForm';
import { getDoorPersonProfile, getShowsForDoorPerson } from '@/lib/door-persons';

export const dynamic = 'force-dynamic';

export default async function EditDoorPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doorPersonId = Number(id);
  if (!Number.isInteger(doorPersonId)) notFound();

  const doorPerson = await getDoorPersonProfile(doorPersonId);
  if (!doorPerson) notFound();

  const shows = await getShowsForDoorPerson(doorPerson.name);

  return (
    <main className="max-w-2xl mx-auto px-6 pb-16 pt-6">
      <DoorPersonForm mode="edit" initialValues={doorPerson} linkedShows={shows} />
    </main>
  );
}
