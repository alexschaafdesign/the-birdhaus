import SoundEngineerForm from '@/components/admin/SoundEngineerForm';

export default function NewSoundEngineerPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <SoundEngineerForm mode="create" />
    </main>
  );
}
