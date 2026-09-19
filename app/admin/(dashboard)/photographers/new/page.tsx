import PhotographerForm from '@/components/admin/PhotographerForm';

export default function NewPhotographerPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <PhotographerForm mode="create" />
    </main>
  );
}
