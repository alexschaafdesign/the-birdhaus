import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { bandsJoinFragment, videosJoinFragment, normalizePhotosInput } from '@/lib/shows';
import { getPhotographerCredits } from '@/lib/photographers';
import { soundEngineersJoinFragment, type ShowSoundEngineer } from '@/lib/sound-engineers';
import { getOrCreateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import ShowForm, { type ShowFormInitialValues } from '@/components/admin/ShowForm';
import ShareLinkBox from '@/components/admin/ShareLinkBox';
import ShowOverview from '@/components/admin/ShowOverview';

export const dynamic = 'force-dynamic';

interface ShowRow {
  id: number;
  slug: string;
  title: string;
  date: string;
  doors_time: string | null;
  show_time: string | null;
  flyer: string | null;
  bands: unknown;
  description: string | null;
  photographer: unknown;
  photographer_id: number | null;
  rsvp_url: string | null;
  ticket_url: string | null;
  external_ticket_url: string | null;
  rsvp_form: boolean;
  videos: unknown;
  audio: unknown;
  photos: unknown;
  photo_folder: string | null;
  photo_credit: string | null;
  content_markdown: string;
  announced: boolean;
  target_band_count: number;
  advance_sent: boolean;
  door_person_name: string | null;
  sound_engineers: unknown;
  square_item_id: string | null;
  square_image_id: string | null;
  ticket_limit: number | null;
}

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [row] = await sql<ShowRow[]>`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}, ${soundEngineersJoinFragment()}
    from shows
    where id = ${showId}
  `;
  if (!row) notFound();

  const squareLinks = await sql<{ tierLabel: string; amountCents: number; url: string | null }[]>`
    select tier_label as "tierLabel", amount_cents as "amountCents", url
    from show_square_links
    where show_id = ${showId}
    order by amount_cents
  `;

  // Lifecycle status for the top-of-tab Overview checklist. One round-trip; each
  // subquery degrades to 0/false when that subsystem has no rows yet.
  const [overview] = await sql<
    {
      invite_sent: boolean;
      band_total: number;
      bands_with_inputs: number;
      rsvp_count: number;
      settlement_saved: boolean;
    }[]
  >`
    select
      exists(select 1 from show_advances where show_id = ${showId} and status = 'sent') as invite_sent,
      (select count(*)::int from show_bands sb where sb.show_id = ${showId} and not sb.excluded) as band_total,
      (select count(distinct band_id)::int from show_input_items where show_id = ${showId}) as bands_with_inputs,
      (select count(*)::int from rsvps where show_id = ${showId}) as rsvp_count,
      exists(select 1 from settlements where show_id = ${showId}) as settlement_saved
  `;
  const engineers = (row.sound_engineers as Array<{ name: string; status: string }> | null) ?? [];
  const confirmedEngineer = engineers.find((e) => e.status === 'confirmed')?.name ?? null;
  const isPastShow = row.date < new Date().toLocaleDateString('en-CA'); // en-CA = YYYY-MM-DD, local

  // Resolve each photo's photographerId → name so the form can display the
  // credit next to each thumbnail (only ids are stored on the row).
  const photoEntries = normalizePhotosInput(row.photos);
  const photoCredits = await getPhotographerCredits([
    ...photoEntries.map((p) => p.photographerId).filter((n): n is number => n != null),
    ...(row.photographer_id != null ? [row.photographer_id] : []),
  ]);
  const assignedPhotographerName =
    row.photographer_id != null ? photoCredits.get(row.photographer_id)?.name ?? null : null;

  const initialValues: ShowFormInitialValues = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    date: row.date,
    doorsTime: row.doors_time,
    showTime: row.show_time,
    flyer: row.flyer,
    bands: (row.bands as ShowFormInitialValues['bands']) ?? [],
    description: row.description,
    photographer: (row.photographer as ShowFormInitialValues['photographer']) ?? null,
    doorPersonName: row.door_person_name,
    ticketUrl: row.ticket_url,
    externalTicketUrl: row.external_ticket_url,
    ticketLimit: row.ticket_limit,
    rsvpForm: row.rsvp_form,
    videos: (row.videos as ShowFormInitialValues['videos']) ?? [],
    audio: (row.audio as ShowFormInitialValues['audio']) ?? [],
    photos: photoEntries.map((p) => ({
      url: p.url,
      photographerId: p.photographerId,
      photographerName: p.photographerId != null ? photoCredits.get(p.photographerId)?.name ?? null : null,
    })),
    assignedPhotographerId: row.photographer_id,
    assignedPhotographerName,
    photoFolder: row.photo_folder,
    photoCredit: row.photo_credit,
    content: row.content_markdown,
    announced: row.announced,
    targetBandCount: row.target_band_count,
    advanceSent: row.advance_sent,
    soundEngineers: (row.sound_engineers as ShowSoundEngineer[]) ?? [],
    squareItemId: row.square_item_id,
    squareImageId: row.square_image_id,
    squareLinks,
  };

  const shareToken = await getOrCreateShareToken(showId);
  const shareUrl = shareToken ? `${SITE_URL}/hub/${shareToken}` : null;

  return (
    <div className="space-y-6">
      <ShowOverview
        showId={showId}
        isPast={isPastShow}
        announced={row.announced}
        bandCount={overview?.band_total ?? 0}
        targetBandCount={row.target_band_count}
        inviteSent={overview?.invite_sent ?? false}
        bandsWithInputs={overview?.bands_with_inputs ?? 0}
        confirmedEngineer={confirmedEngineer}
        doorPerson={row.door_person_name?.trim() || null}
        photographerAssigned={row.photographer_id != null}
        rsvpCount={overview?.rsvp_count ?? 0}
        settlementSaved={overview?.settlement_saved ?? false}
      />
      {shareUrl && <ShareLinkBox showId={showId} initialUrl={shareUrl} />}
      <ShowForm mode="edit" embedded initialValues={initialValues} />
    </div>
  );
}
