import BandForm from '@/components/admin/BandForm';

export default function NewBandPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 pb-16 pt-6">
      <BandForm mode="create" />
    </main>
  );
}
