import { notFound } from 'next/navigation';
import SoundEngineerForm from '@/components/admin/SoundEngineerForm';
import { getSoundEngineerProfile, getShowsForSoundEngineer } from '@/lib/sound-engineers';

export const dynamic = 'force-dynamic';

export default async function EditSoundEngineerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const engineerId = Number(id);
  if (!Number.isInteger(engineerId)) notFound();

  const engineer = await getSoundEngineerProfile(engineerId);
  if (!engineer) notFound();

  const shows = await getShowsForSoundEngineer(engineerId);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <SoundEngineerForm mode="edit" initialValues={engineer} linkedShows={shows} />
    </main>
  );
}
