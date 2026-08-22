import { sql } from './db';

// Photographer registry (050_photographers.sql). Mirrors lib/sound-engineers'
// profile helpers. Photographers have no per-show join table — they're linked
// to shows only via the free-text name recorded on settlements — so the
// "shows worked" history is a name match against settlements.

export interface Photographer {
  id: number;
  name: string;
}

export async function getAllPhotographers(): Promise<Photographer[]> {
  const rows = await sql<Array<{ id: number; name: string }>>`
    select id, name from photographers order by name asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

export interface PhotographerProfile {
  id: number;
  name: string;
  photo: string | null;
  bio: string | null;
  instagram: string | null;
  contactEmail: string | null;
}

export async function getPhotographerProfile(id: number): Promise<PhotographerProfile | null> {
  const [row] = await sql<
    Array<{ id: number; name: string; photo: string | null; bio: string | null; instagram: string | null; contact_email: string | null }>
  >`
    select id, name, photo, bio, instagram, contact_email from photographers where id = ${id}
  `;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    photo: row.photo,
    bio: row.bio,
    instagram: row.instagram,
    contactEmail: row.contact_email,
  };
}

// Shows this photographer shot, matched by the name on each settlement (there's
// no structured per-show link). Newest first.
export interface PhotographerShow {
  id: number;
  slug: string;
  title: string;
  date: string;
}

export async function getShowsForPhotographer(name: string): Promise<PhotographerShow[]> {
  const rows = await sql<Array<{ id: number; slug: string; title: string; date: string }>>`
    select s.id, s.slug, s.title, s.date::text as date
    from settlements st
    join shows s on s.id = st.show_id
    where lower(trim(st.photographer_name)) = lower(trim(${name}))
    order by s.date desc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, title: r.title, date: r.date }));
}
