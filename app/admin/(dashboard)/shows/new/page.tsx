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
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <ShowForm
        mode="create"
        initialValues={date ? { date } : undefined}
        isPast={Boolean(date && ISO_DATE_RE.test(date) && date < nightDate)}
        nightDate={nightDate}
      />
    </main>
  );
}
