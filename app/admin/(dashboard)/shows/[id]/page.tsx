import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { bandsJoinFragment, videosJoinFragment } from '@/lib/shows';
import { getRsvpsForShow } from '@/lib/rsvps';
import ShowForm, { type ShowFormInitialValues } from '@/components/admin/ShowForm';
import RsvpSummary from '@/components/admin/RsvpSummary';

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
  sound_engineer_name: string | null;
  target_band_count: number;
  advance_sent: boolean;
}

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [row] = await sql<ShowRow[]>`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}
    from shows
    where id = ${showId}
  `;
  if (!row) notFound();

  const rsvpSummary = await getRsvpsForShow(showId);

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
    ticketUrl: row.ticket_url,
    externalTicketUrl: row.external_ticket_url,
    rsvpForm: row.rsvp_form,
    videos: (row.videos as ShowFormInitialValues['videos']) ?? [],
    audio: (row.audio as ShowFormInitialValues['audio']) ?? [],
    photos: (row.photos as string[]) ?? [],
    photoFolder: row.photo_folder,
    photoCredit: row.photo_credit,
    content: row.content_markdown,
    announced: row.announced,
    soundEngineerName: row.sound_engineer_name,
    targetBandCount: row.target_band_count,
    advanceSent: row.advance_sent,
  };

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <ShowForm mode="edit" initialValues={initialValues} />
      <RsvpSummary {...rsvpSummary} />
    </main>
  );
}
