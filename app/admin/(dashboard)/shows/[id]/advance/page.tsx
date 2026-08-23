import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The old Advance tab — merged into the Portal tab. Kept as a redirect so old
// links (bookmarks, notification emails) keep working.
export default async function ShowAdvancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  redirect(`/admin/shows/${showId}/portal`);
}
