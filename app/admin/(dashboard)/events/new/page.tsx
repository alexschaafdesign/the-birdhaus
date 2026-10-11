import type { Metadata } from 'next';
import ShowForm from '@/components/admin/ShowForm';

export const metadata: Metadata = {
  title: 'New event',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Add a show. (Song Club events are added in Songhaus admin.)
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-6 text-[#E8E0D0]">
      <h1 className="mb-6 text-2xl font-bold">New event</h1>
      <ShowForm mode="create" initialValues={date ? { date } : undefined} />
    </main>
  );
}
