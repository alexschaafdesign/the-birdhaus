import { notFound } from 'next/navigation';
import Link from 'next/link';
import PhotographerForm from '@/components/admin/PhotographerForm';
import {
  getPhotographerProfile,
  getShowsForPhotographer,
  photographerSlug,
} from '@/lib/photographers';
import { listCrew } from '@/lib/accounts/members';

export const dynamic = 'force-dynamic';

export default async function EditPhotographerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photographerId = Number(id);
  if (!Number.isInteger(photographerId)) notFound();

  const photographer = await getPhotographerProfile(photographerId);
  if (!photographer) notFound();

  const [shows, crew] = await Promise.all([
    getShowsForPhotographer(photographer.name),
    listCrew(),
  ]);
  const crewOptions = crew.map((c) => ({ id: c.id, name: c.name, email: c.email }));

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-4 flex flex-wrap gap-4">
        <Link
          href={`/photos/${photographerSlug(photographer.name)}`}
          target="_blank"
          className="text-body-3 hover:text-accent-red underline underline-offset-4"
        >
          View public profile ↗
        </Link>
        {photographer.userId != null && (
          <Link
            href={`/admin/crew/${photographer.userId}/preview`}
            className="text-body-3 hover:text-accent-red underline underline-offset-4"
          >
            Preview their dashboard
          </Link>
        )}
      </div>
      <PhotographerForm
        mode="edit"
        initialValues={photographer}
        linkedShows={shows}
        crewOptions={crewOptions}
      />
    </main>
  );
}
