import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/song-club';
import SongClubEventForm from '@/components/admin/SongClubEventForm';

export const metadata: Metadata = {
  title: 'Edit meetup',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function EditSongClubEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const event = Number.isInteger(id) ? await getEventById(id) : null;
  if (!event) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 text-[#E8E0D0]">
      <h2 className="mb-6 text-xl font-medium">Edit meetup</h2>
      <SongClubEventForm
        mode="edit"
        initial={{
          id: event.id,
          title: event.title,
          eventDate: event.event_date,
          startTime: event.start_time ?? '',
          endTime: event.end_time ?? '',
          venueName: event.venue_name ?? '',
          address: event.address ?? '',
          arrivalNotes: event.arrival_notes ?? '',
          description: event.description ?? '',
          flyerUrl: event.flyer_url ?? '',
          published: event.published,
        }}
      />
    </main>
  );
}
