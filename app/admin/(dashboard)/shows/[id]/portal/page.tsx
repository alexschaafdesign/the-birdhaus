import { notFound } from 'next/navigation';
import { getOrCreateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import ShareLinkBox from '@/components/admin/ShareLinkBox';

export const dynamic = 'force-dynamic';

// The Portal tab: the shareable band/engineer hub link plus a live preview of
// the read-only page the bands actually see.
export default async function ShowPortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  const portalUrl = shareToken ? `${SITE_URL}/hub/${shareToken}` : null;

  if (!portalUrl) {
    return (
      <p className="text-sm text-[#E8E0D0]/50">
        Couldn&apos;t generate a portal link for this show.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ShareLinkBox showId={showId} initialUrl={portalUrl} />
      <div className="border border-[#E8E0D0]/15 rounded-lg overflow-hidden">
        <div className="border-b border-[#E8E0D0]/15 px-4 py-2 text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Preview
        </div>
        <iframe
          src={portalUrl}
          title="Advance portal preview"
          className="w-full h-[70vh] bg-white"
        />
      </div>
    </div>
  );
}
