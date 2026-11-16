import PhotographerForm from '@/components/admin/PhotographerForm';

export default function NewPhotographerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <PhotographerForm mode="create" />
    </main>
  );
}
