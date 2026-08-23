import { notFound, redirect } from 'next/navigation';
import { getOrCreateShareToken } from '@/lib/share-token';

export const dynamic = 'force-dynamic';

// The Portal tab: straight to the one portal page (/hub/<token>). Bands see the
// band view there; an admin session sees the same page plus the inline admin
// controls (invite, editing, recipients) — see components/hub/HubAdmin.tsx.
export default async function ShowPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  if (!shareToken) notFound();

  redirect(`/hub/${shareToken}`);
}
