import type { Metadata } from 'next';
import SongClubEventForm from '@/components/admin/SongClubEventForm';
import { listPlaylists } from '@/lib/club-music';

export const metadata: Metadata = {
  title: 'New meetup',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewSongClubEventPage() {
  const rounds = (await listPlaylists()).map((p) => ({ id: p.id, title: p.title }));
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 text-[#E8E0D0]">
      <h2 className="mb-6 text-xl font-medium">New meetup</h2>
      <SongClubEventForm mode="add" rounds={rounds} />
    </main>
  );
}
