import type { Metadata } from 'next';
import SongClubEventForm from '@/components/admin/SongClubEventForm';

export const metadata: Metadata = {
  title: 'New meetup',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function NewSongClubEventPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 text-[#E8E0D0]">
      <h2 className="mb-6 text-xl font-medium">New meetup</h2>
      <SongClubEventForm mode="add" />
    </main>
  );
}
