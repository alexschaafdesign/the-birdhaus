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
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <DoorPersonForm mode="edit" initialValues={doorPerson} linkedShows={shows} />
    </main>
  );
}
