import { sql } from '@/lib/db';
import { SHOW_COLUMNS, bandsJoinFragment, getNightDateCentral, videosJoinFragment, normalizePhotosInput } from '@/lib/shows';
import { getPhotographerCredits } from '@/lib/photographers';
import { soundEngineersJoinFragment, type ShowSoundEngineer } from '@/lib/sound-engineers';
import { guardTicketUrl } from '@/lib/staging';
import type { ShowFormInitialValues } from '@/components/admin/ShowForm';
import { getSavedScheduleRows } from '@/lib/advance';
import { timesFromSchedule } from '@/lib/schedule-board';

// Everything the show form needs, shared by the Overview, Lineup & crew and
// Public page tabs (each renders its own section of the same form).

export interface ShowRow {
  id: number;
  slug: string;
  catalogue_id: string;
  status: 'scheduled' | 'cancelled' | 'postponed';
  rescheduled_to: string | number | null;
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
  needs_sound_engineer: boolean;
  door_person_name: string | null;
  sound_engineers: unknown;
  square_item_id: string | null;
  square_image_id: string | null;
  ticket_limit: number | null;
}

export interface ShowFormData {
  row: ShowRow;
  initialValues: ShowFormInitialValues;
  isPastShow: boolean;
  nightDate: string;
  confirmedEngineer: string | null;
  assignedPhotographerName: string | null;
}

export async function loadShowFormData(showId: number): Promise<ShowFormData | null> {
  const [row] = await sql<ShowRow[]>`
    select ${sql(SHOW_COLUMNS)}, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()},
      ${soundEngineersJoinFragment()}
    from shows
    where id = ${showId}
  `;
  if (!row) return null;

  // Set notes live only on show_bands (093), and contacts / payout handles
  // only on the band's admin profile — neither is in the bands join fragment
  // the public pages share. Read them here and merge them in by band.
  const lineupExtras = await sql<
    { band_id: string; notes: string | null; contact_email: string | null; payment_method: string | null }[]
  >`
    select sb.band_id, sb.notes, b.contact_email, b.payment_method
    from show_bands sb
    join bands b on b.id = sb.band_id
    where sb.show_id = ${showId}
  `;
  const extrasByBand = new Map(lineupExtras.map((r) => [Number(r.band_id), r]));

  const squareLinkRows = await sql<{ tierLabel: string; amountCents: number; url: string | null }[]>`
    select tier_label as "tierLabel", amount_cents as "amountCents", url
    from show_square_links
    where show_id = ${showId}
    order by amount_cents
  `;
  // Display only (the form never saves these): off production a live Square
  // link shows as the disabled /checkout path, so a click on staging can't buy.
  const squareLinks = squareLinkRows.map((l) => ({
    ...l,
    url: l.url ? guardTicketUrl(l.url, row.catalogue_id ?? row.slug) : null,
  }));

  const engineers = (row.sound_engineers as Array<{ name: string; status: string }> | null) ?? [];
  const confirmedEngineer = engineers.find((e) => e.status === 'confirmed')?.name ?? null;
  // Past by the show page's rule: the night is over at 5am Central.
  const nightDate = getNightDateCentral();
  const isPastShow = row.date < nightDate;

  // Resolve each photo's photographerId → name so the form can display the
  // credit next to each thumbnail (only ids are stored on the row).
  const photoEntries = normalizePhotosInput(row.photos);
  const photoCredits = await getPhotographerCredits([
    ...photoEntries.map((p) => p.photographerId).filter((n): n is number => n != null),
    ...(row.photographer_id != null ? [row.photographer_id] : []),
  ]);
  const assignedPhotographerName =
    row.photographer_id != null ? photoCredits.get(row.photographer_id)?.name ?? null : null;

  // A postponed show links to the night that replaced it.
  const [rescheduled] = row.rescheduled_to != null
    ? await sql<{ id: string; catalogue_id: string; date: string }[]>`
        select id, catalogue_id, date::text as date from shows where id = ${row.rescheduled_to}
      `
    : [];

  const scheduleTimes = timesFromSchedule(await getSavedScheduleRows(showId));

  const initialValues: ShowFormInitialValues = {
    id: row.id,
    slug: row.slug,
    catalogueId: row.catalogue_id,
    status: row.status,
    rescheduledTo: rescheduled
      ? { id: Number(rescheduled.id), catalogueId: rescheduled.catalogue_id, date: rescheduled.date }
      : null,
    title: row.title,
    date: row.date,
    doorsTime: row.doors_time,
    showTime: row.show_time,
    flyer: row.flyer,
    bands: ((row.bands as Array<{ name: string; bandId?: number }>) ?? []).map((b) => {
      const extra = b.bandId != null ? extrasByBand.get(Number(b.bandId)) : undefined;
      return extra
        ? { ...b, notes: extra.notes ?? undefined, email: extra.contact_email, payout: extra.payment_method }
        : b;
    }),
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
      bandId: p.bandId,
    })),
    assignedPhotographerId: row.photographer_id,
    assignedPhotographerName,
    photoFolder: row.photo_folder,
    photoCredit: row.photo_credit,
    content: row.content_markdown,
    announced: row.announced,
    targetBandCount: row.target_band_count,
    advanceSent: row.advance_sent,
    needsSoundEngineer: row.needs_sound_engineer,
    soundEngineers: (row.sound_engineers as ShowSoundEngineer[]) ?? [],
    squareItemId: row.square_item_id,
    squareImageId: row.square_image_id,
    squareLinks,
    scheduleTimes,
  };

  return { row, initialValues, isPastShow, nightDate, confirmedEngineer, assignedPhotographerName };
}
