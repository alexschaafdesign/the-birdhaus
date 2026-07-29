import { notFound } from 'next/navigation';
import { getShowInputsState } from '@/lib/inputs';
import { INPUT_CATALOG } from '@/lib/input-catalog';
import ShowInputsPanel from '@/components/admin/ShowInputsPanel';

export const dynamic = 'force-dynamic';

export default async function ShowInputsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const state = await getShowInputsState(showId);
  if (!state) notFound();

  return <ShowInputsPanel initial={state} catalog={INPUT_CATALOG} />;
}
