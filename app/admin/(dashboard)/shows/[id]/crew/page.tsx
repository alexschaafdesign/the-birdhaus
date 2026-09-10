import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import ShowCrewPanel, {
  type CrewBand,
  type CrewEngineer,
  type CrewRegistryEntry,
} from '@/components/admin/ShowCrewPanel';

export const dynamic = 'force-dynamic';

// The Crew & contacts tab: the one place for everyone you contact or pay for a
// show — bands, sound engineers, the door person, the photographer — each with
// their email and payout handle. Email/payout save to the person's own profile
// (shared across every show); the door/photographer assignment saves to this
// show. All writes reuse the existing /api/admin/* routes.
export default async function ShowCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; door_person_name: string | null; photographer_id: number | null }[]>`
    select id, door_person_name, photographer_id from shows where id = ${showId}
  `;
  if (!show) notFound();

  // bigint columns come back as strings from the driver; normalize the assigned
  // photographer id to a number so it matches the (also-numeric) roster ids below.
  const assignedPhotographerId = show.photographer_id != null ? Number(show.photographer_id) : null;

  const [bandRows, engineerRows, doorRoster, photographerRoster] = await Promise.all([
    sql<
      { band_id: number; name: string; contact_email: string | null; payment_method: string | null; photo: string | null; excluded: boolean }[]
    >`
      select b.id as band_id, b.name, b.contact_email, b.payment_method, b.photo, sb.excluded
      from show_bands sb
      join bands b on b.id = sb.band_id
      where sb.show_id = ${showId}
      order by sb.sort_order asc
    `,
    sql<
      { id: number; name: string; status: 'confirmed' | 'asked' | 'declined'; contact_email: string | null; payment_method: string | null; photo: string | null }[]
    >`
      select se.id, se.name, sse.status, se.contact_email, se.payment_method, se.photo
      from show_sound_engineers sse
      join sound_engineers se on se.id = sse.sound_engineer_id
      where sse.show_id = ${showId}
      order by
        case sse.status when 'confirmed' then 0 when 'asked' then 1 else 2 end,
        se.name asc
    `,
    sql<{ id: number; name: string; contact_email: string | null; payment_method: string | null; photo: string | null }[]>`
      select id, name, contact_email, payment_method, photo from door_persons order by name asc
    `,
    sql<{ id: number; name: string; contact_email: string | null; payment_method: string | null; photo: string | null }[]>`
      select id, name, contact_email, payment_method, photo from photographers order by name asc
    `,
  ]);

  const bands: CrewBand[] = bandRows.map((r) => ({
    bandId: Number(r.band_id),
    name: r.name,
    email: r.contact_email,
    payoutHandle: r.payment_method,
    photo: r.photo,
    excluded: r.excluded,
  }));

  const engineers: CrewEngineer[] = engineerRows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    status: r.status,
    email: r.contact_email,
    payoutHandle: r.payment_method,
    photo: r.photo,
  }));

  const toEntry = (r: { id: number; name: string; contact_email: string | null; payment_method: string | null; photo: string | null }): CrewRegistryEntry => ({
    id: Number(r.id),
    name: r.name,
    email: r.contact_email,
    payoutHandle: r.payment_method,
    photo: r.photo,
  });

  const doorPersons = doorRoster.map(toEntry);
  const photographers = photographerRoster.map(toEntry);

  // The assigned door person is stored as free text on the show; match it back to
  // a roster row (case-insensitive) so we know whose profile to edit. An unmatched
  // custom name is kept so the picker doesn't silently drop it.
  const assignedDoorName = show.door_person_name?.trim() ?? '';

  return (
    <ShowCrewPanel
      showId={showId}
      bands={bands}
      engineers={engineers}
      doorPersons={doorPersons}
      assignedDoorName={assignedDoorName}
      photographers={photographers}
      assignedPhotographerId={assignedPhotographerId}
    />
  );
}
