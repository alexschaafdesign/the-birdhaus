import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShowHubData } from '@/lib/show-hub';
import { isAdminSession } from '@/lib/admin-session';
import { getShowIdByShareToken } from '@/lib/share-token';
import { getShowAdvanceState, type ShowAdvanceState } from '@/lib/advance';
import ShowHubView from '@/components/hub/ShowHubView';

export const dynamic = 'force-dynamic';

// Token-gated and shared by link — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ShowHubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [data, isAdmin] = await Promise.all([getShowHubData(token), isAdminSession()]);
  if (!data) notFound();

  // Admin visitors get the same page plus inline controls: the portal IS the
  // admin surface for advancing a show. adminState (recipient emails, Venmo
  // handles, invite status) is only fetched — and its components only rendered —
  // behind the server-side session check; every write it makes goes through the
  // proxy-gated /api/admin routes.
  let adminState: ShowAdvanceState | null = null;
  if (isAdmin) {
    const showId = await getShowIdByShareToken(token);
    if (showId !== null) adminState = await getShowAdvanceState(showId);
  }

  return (
    <main className="min-h-screen bg-[#2A2420] text-[#E8E0D0] px-5 py-10">
      <ShowHubView data={data} token={token} isAdmin={isAdmin} adminState={adminState} />
    </main>
  );
}
