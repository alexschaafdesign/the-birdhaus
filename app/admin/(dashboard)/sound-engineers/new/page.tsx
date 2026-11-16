import SoundEngineerForm from '@/components/admin/SoundEngineerForm';

export default function NewSoundEngineerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <SoundEngineerForm mode="create" />
    </main>
  );
}
