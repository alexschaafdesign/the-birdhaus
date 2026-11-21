import { notFound } from 'next/navigation';
import { getOrCreateShareToken } from '@/lib/share-token';
import { getShowHubData } from '@/lib/show-hub';
import { getShowAdvanceState } from '@/lib/advance';
import { getShowInputsState } from '@/lib/inputs';
import { INPUT_CATALOG } from '@/lib/input-catalog';
import ShowHubView from '@/components/hub/ShowHubView';
import ShowInputsPanel from '@/components/admin/ShowInputsPanel';

export const dynamic = 'force-dynamic';

// The Advance tab: the band-facing Portal (/hub/<token>) as bands see it, with
// the admin's pay editor (components/hub/HubAdmin.tsx), and the input lists
// edited below it. Advancing itself happens by email; the schedule is edited on
// the Overview and the "Advance sent" box is ticked there. The admin session is enforced by the dashboard layout.
export default async function ShowAdvancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  if (!shareToken) notFound();

  const [data, adminState, inputs] = await Promise.all([
    getShowHubData(shareToken),
    getShowAdvanceState(showId),
    getShowInputsState(showId),
  ]);
  if (!data || !inputs) notFound();

  return (
    <div className="space-y-10">
      <ShowHubView data={data} token={shareToken} isAdmin adminState={adminState} />
      <section id="inputs" className="scroll-mt-6 border-t-2 border-surface-ink pt-8">
        <ShowInputsPanel initial={inputs} catalog={INPUT_CATALOG} />
      </section>
    </div>
  );
}
