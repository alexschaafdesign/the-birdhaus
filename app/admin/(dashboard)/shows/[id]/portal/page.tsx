import { notFound } from 'next/navigation';
import { getOrCreateShareToken } from '@/lib/share-token';
import { getShowHubData } from '@/lib/show-hub';
import { getShowAdvanceState } from '@/lib/advance';
import ShowHubView from '@/components/hub/ShowHubView';

export const dynamic = 'force-dynamic';

// The Portal tab renders the band-facing portal (/hub/<token>) inline, inside
// the admin workspace, so the top nav and show tabs stay put — no more bouncing
// out to the standalone page. The admin session is already enforced by the
// dashboard layout, so this always renders the admin view (inline invite,
// editing, recipients — see components/hub/HubAdmin.tsx).
export default async function ShowPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  if (!shareToken) notFound();

  const [data, adminState] = await Promise.all([
    getShowHubData(shareToken),
    getShowAdvanceState(showId),
  ]);
  if (!data) notFound();

  return <ShowHubView data={data} token={shareToken} isAdmin adminState={adminState} />;
}
