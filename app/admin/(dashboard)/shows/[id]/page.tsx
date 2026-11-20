import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { getOneShowHealth } from '@/lib/show-health-data';
import { getOrCreateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import ShowForm from '@/components/admin/ShowForm';
import ShareLinkBox from '@/components/admin/ShareLinkBox';
import ShowOverview from '@/components/admin/ShowOverview';
import { loadShowFormData } from './form-data';

export const dynamic = 'force-dynamic';

// The Overview tab: the show's checklist, the share link, and the basics —
// title, date, status, times, flyer, announce.
export default async function ShowOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [data, facts, [counts]] = await Promise.all([
    loadShowFormData(showId),
    getOneShowHealth(showId),
    sql<{ active_band_count: number; bands_with_inputs: number; settlement_saved: boolean }[]>`
      select
        (select count(*)::int from show_bands where show_id = ${showId} and not excluded) as active_band_count,
        (select count(distinct band_id)::int from show_input_items where show_id = ${showId}) as bands_with_inputs,
        exists(select 1 from settlements where show_id = ${showId}) as settlement_saved
    `,
  ]);
  if (!data || !facts) notFound();

  const shareToken = await getOrCreateShareToken(showId);
  const shareUrl = shareToken ? `${SITE_URL}/hub/${shareToken}` : null;

  return (
    <div className="space-y-6">
      <ShowOverview
        showId={showId}
        facts={facts}
        today={getTodayCentral()}
        confirmedEngineer={data.confirmedEngineer}
        doorPerson={data.row.door_person_name?.trim() || null}
        photographerName={data.assignedPhotographerName}
        bandsWithInputs={counts?.bands_with_inputs ?? 0}
        activeBandCount={counts?.active_band_count ?? 0}
        settlementSaved={counts?.settlement_saved ?? false}
      />
      {shareUrl && <ShareLinkBox showId={showId} initialUrl={shareUrl} />}
      <ShowForm
        mode="edit"
        embedded
        section="overview"
        initialValues={data.initialValues}
        isPast={data.isPastShow}
        nightDate={data.nightDate}
      />
    </div>
  );
}
