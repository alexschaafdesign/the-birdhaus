import { sql } from './db';

// Door-person registry (068_door_persons.sql). Mirrors lib/photographers'
// profile helpers. Door people have no per-show join table — they're linked to
// shows only via the free-text name recorded on settlements — so the "shows
// worked" history is a name match against settlements.

export interface DoorPerson {
  id: number;
  name: string;
}

export async function getAllDoorPersons(): Promise<DoorPerson[]> {
  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name from door_persons order by name asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

export interface DoorPersonProfile {
  id: number;
  name: string;
  photo: string | null;
  bio: string | null;
  instagram: string | null;
  contactEmail: string | null;
  // Payment handle (Venmo username, etc.), mirroring bands.payment_method.
  // Admin-only — surfaced on the settlement sheet when paying out.
  paymentMethod: string | null;
}

export async function getDoorPersonProfile(id: number): Promise<DoorPersonProfile | null> {
  const [row] = await sql<
    Array<{ id: number; name: string; photo: string | null; bio: string | null; instagram: string | null; contact_email: string | null; payment_method: string | null }>
  >`
    select id, name, photo, bio, instagram, contact_email, payment_method from door_persons where id = ${id}
  `;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    photo: row.photo,
    bio: row.bio,
    instagram: row.instagram,
    contactEmail: row.contact_email,
    paymentMethod: row.payment_method,
  };
}

// Shows this door person worked, matched by the name on each settlement (there's
// no structured per-show link). Newest first.
export interface DoorPersonShow {
  id: number;
  slug: string;
  title: string;
  date: string;
}

export async function getShowsForDoorPerson(name: string): Promise<DoorPersonShow[]> {
  const rows = await sql<Array<{ id: number; slug: string; title: string; date: string }>>`
    select s.id, s.slug, s.title, s.date::text as date
    from settlements st
    join shows s on s.id = st.show_id
    where lower(trim(st.door_person_name)) = lower(trim(${name}))
    order by s.date desc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, title: r.title, date: r.date }));
}
