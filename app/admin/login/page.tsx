import { redirect } from 'next/navigation';

// The admin door is no longer separate: everyone signs in through the one
// Birdhaus login, and a staff-role account automatically gets admin access
// (lib/club-session.ts). This route just forwards old bookmarks / any proxy.ts
// redirect that still points here.
export default async function AdminLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = (await searchParams).next;
  redirect(next && next.startsWith('/admin') ? `/login?next=${encodeURIComponent(next)}` : '/login');
}
