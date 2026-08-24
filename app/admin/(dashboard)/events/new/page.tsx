import type { Metadata } from 'next';
import { listPlaylists } from '@/lib/club-music';
import NewEventForm from '@/components/admin/NewEventForm';

export const metadata: Metadata = {
  title: 'New event',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Unified "add an event": pick Show or Song Club, then fill the matching form.
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string }>;
}) {
  const { date, type } = await searchParams;
  const rounds = (await listPlaylists()).map((p) => ({ id: p.id, title: p.title }));

  return (
    <main className="mx-auto max-w-4xl px-6 pb-16 pt-6 text-[#E8E0D0]">
      <h1 className="mb-6 text-2xl font-bold">New event</h1>
      <NewEventForm
        initialDate={date}
        initialType={type === 'song_club' ? 'song_club' : 'show'}
        rounds={rounds}
      />
    </main>
  );
}
