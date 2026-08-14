import { notFound, redirect } from 'next/navigation';
import { getOrCreateShareToken } from '@/lib/share-token';

export const dynamic = 'force-dynamic';

// The Portal tab: sends you straight to the read-only hub page the bands see.
export default async function ShowPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  if (!shareToken) notFound();

  redirect(`/hub/${shareToken}`);
}
