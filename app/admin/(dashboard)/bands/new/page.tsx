import BandForm from '@/components/admin/BandForm';

export default function NewBandPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <BandForm mode="create" />
    </main>
  );
}
