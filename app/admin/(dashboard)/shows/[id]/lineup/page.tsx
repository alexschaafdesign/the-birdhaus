import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import ShowCrewPanel, {
  type CrewEngineer,
  type CrewRegistryEntry,
} from '@/components/admin/ShowCrewPanel';
import { loadShowFormData } from '../form-data';

export const dynamic = 'force-dynamic';

// The Crew tab: sound engineers, door person and photographer, each saving on
// their own. (The bands live on the Overview.) Contacts and payout handles save
// to each person's profile, so they carry over to the settlement and future
// shows. The URL stays /lineup so older links and emails keep working.
export default async function ShowLineupPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [formData, engineerRows, doorRoster, photographerRoster] = await Promise.all([
    loadShowFormData(showId),
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

  if (!formData) notFound();

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
    <div className="space-y-6">
      <ShowCrewPanel
        showId={showId}
        needsSoundEngineer={formData.row.needs_sound_engineer}
        engineers={engineers}
        doorPersons={doorPersons}
        assignedDoorName={assignedDoorName}
        photographers={photographers}
        assignedPhotographerId={assignedPhotographerId}
      />
    </div>
  );
}
