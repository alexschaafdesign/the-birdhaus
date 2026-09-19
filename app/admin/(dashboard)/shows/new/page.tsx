import ShowForm from '@/components/admin/ShowForm';

export default async function NewShowPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <ShowForm mode="create" initialValues={date ? { date } : undefined} />
    </main>
  );
}
