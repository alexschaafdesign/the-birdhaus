import { notFound } from 'next/navigation';
import PhotographerForm from '@/components/admin/PhotographerForm';
import { getPhotographerProfile, getShowsForPhotographer } from '@/lib/photographers';

export const dynamic = 'force-dynamic';

export default async function EditPhotographerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photographerId = Number(id);
  if (!Number.isInteger(photographerId)) notFound();

  const photographer = await getPhotographerProfile(photographerId);
  if (!photographer) notFound();

  const shows = await getShowsForPhotographer(photographer.name);

  return (
    <main className="max-w-2xl mx-auto px-6 pb-16 pt-6">
      <PhotographerForm mode="edit" initialValues={photographer} linkedShows={shows} />
    </main>
  );
}
