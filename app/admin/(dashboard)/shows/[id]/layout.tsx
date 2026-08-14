import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { getOrCreateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import ShowTabs from '@/components/admin/ShowTabs';

export const dynamic = 'force-dynamic';

// Per-show workspace shell: title + tab nav shared across the Details,
// Settlement, and RSVPs tabs. Each tab renders its own content into {children}.
export default async function ShowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string; date: string | null }[]>`
    select id, title, date::text as date from shows where id = ${showId}
  `;
  if (!show) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  const portalUrl = shareToken ? `${SITE_URL}/hub/${shareToken}` : null;

  const prettyDate = show.date
    ? new Date(`${show.date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/shows"
          className="inline-flex items-center gap-1 text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] transition-colors"
        >
          ← Back to shows
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{show.title}</h1>
          {prettyDate && <p className="text-sm text-[#E8E0D0]/50">{prettyDate}</p>}
        </div>
        <ShowTabs id={showId} portalUrl={portalUrl} />
      </div>
      {children}
    </main>
  );
}
