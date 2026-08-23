import { notFound } from 'next/navigation';
import { getShowAdvanceState } from '@/lib/advance';
import ShowAdvancePanel from '@/components/admin/ShowAdvancePanel';

export const dynamic = 'force-dynamic';

// The Portal tab: the admin side of the band portal — its content (show info),
// the message thread, recipients, and the invite email that points the lineup
// at it. The public page bands see is /hub/<token> ("Open portal" up top).
export default async function ShowPortalPage({
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
