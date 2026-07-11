import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import ShowForm, { type ShowFormInitialValues } from '@/components/admin/ShowForm';

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
}

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [row] = await sql<ShowRow[]>`select *, date::text as date from shows where id = ${showId}`;
  if (!row) notFound();

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
  };

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6">
      <ShowForm mode="edit" initialValues={initialValues} />
    </main>
  );
}
