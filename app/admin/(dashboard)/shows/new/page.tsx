import ShowForm from '@/components/admin/ShowForm';
import { ISO_DATE_RE, getNightDateCentral } from '@/lib/shows';

export default async function NewShowPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const nightDate = getNightDateCentral();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <ShowForm
        mode="create"
        initialValues={date ? { date } : undefined}
        isPast={Boolean(date && ISO_DATE_RE.test(date) && date < nightDate)}
        nightDate={nightDate}
      />
    </main>
  );
}
