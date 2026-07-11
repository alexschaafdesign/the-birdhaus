import ShowForm from '@/components/admin/ShowForm';

export default function NewShowPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6">
      <ShowForm mode="create" />
    </main>
  );
}
