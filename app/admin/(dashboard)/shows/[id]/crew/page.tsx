import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The old Crew tab — now part of Lineup & crew. Kept as a redirect so old links (bookmarks, emails) keep working.
export default async function OldShowTabRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();
  redirect(`/admin/shows/${showId}/lineup`);
}
