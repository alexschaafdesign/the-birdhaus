import { notFound } from 'next/navigation';
import ShowForm from '@/components/admin/ShowForm';
import ShowTabTodos from '@/components/admin/ShowTabTodos';
import { loadShowFormData } from '../form-data';

export const dynamic = 'force-dynamic';

// The Public page tab: what the public sees — description, tickets and Square,
// the RSVP form, and after the show the videos, photos and audio.
export default async function ShowPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const data = await loadShowFormData(showId);
  if (!data) notFound();

  return (
    <div className="space-y-4">
    <ShowTabTodos showId={showId} keys={['videos-missing', 'rsvp-off']} />
    <ShowForm
      mode="edit"
      embedded
      section="public"
      initialValues={data.initialValues}
      isPast={data.isPastShow}
      nightDate={data.nightDate}
    />
    </div>
  );
}
