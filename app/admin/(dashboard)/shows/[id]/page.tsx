import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { bandsJoinFragment, videosJoinFragment, normalizePhotosInput } from '@/lib/shows';
import { getPhotographerCredits } from '@/lib/photographers';
import { soundEngineersJoinFragment, type ShowSoundEngineer } from '@/lib/sound-engineers';
import { getOrCreateShareToken } from '@/lib/share-token';
import { SITE_URL } from '@/lib/site';
import ShowForm, { type ShowFormInitialValues } from '@/components/admin/ShowForm';
import ShareLinkBox from '@/components/admin/ShareLinkBox';

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

  // Resolve each photo's photographerId → name so the form can display the
  // credit next to each thumbnail (only ids are stored on the row).
  const photoEntries = normalizePhotosInput(row.photos);
  const photoCredits = await getPhotographerCredits(
    photoEntries.map((p) => p.photographerId).filter((n): n is number => n != null)
  );

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
      {shareUrl && <ShareLinkBox showId={showId} initialUrl={shareUrl} />}
      <ShowForm mode="edit" embedded initialValues={initialValues} />
    </div>
  );
}
