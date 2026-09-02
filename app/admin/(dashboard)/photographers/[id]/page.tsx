import { notFound } from 'next/navigation';
import Link from 'next/link';
import PhotographerForm from '@/components/admin/PhotographerForm';
import {
  getPhotographerProfile,
  getShowsForPhotographer,
  photographerSlug,
} from '@/lib/photographers';

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
      <div className="mb-4">
        <Link
          href={`/photos/${photographerSlug(photographer.name)}`}
          target="_blank"
          className="text-sm text-[#E8E0D0]/60 underline decoration-dotted underline-offset-2 hover:text-[#E8E0D0]"
        >
          View public profile ↗
        </Link>
      </div>
      <PhotographerForm mode="edit" initialValues={photographer} linkedShows={shows} />
    </main>
  );
}
