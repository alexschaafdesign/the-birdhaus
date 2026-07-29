import { notFound } from 'next/navigation';
import { getShowAdvanceState } from '@/lib/advance';
import ShowAdvancePanel from '@/components/admin/ShowAdvancePanel';

export const dynamic = 'force-dynamic';

export default async function ShowAdvancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const state = await getShowAdvanceState(showId);
  if (!state) notFound();

  return <ShowAdvancePanel initial={state} />;
}
