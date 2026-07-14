import { sql } from './db';

export interface Rsvp {
  id: number;
  show_id: number;
  name: string;
  email: string;
  guests: number;
  email_list_opt_in: boolean;
  confirmation_email_sent_at: string | null;
  created_at: string;
}

export interface RsvpSummary {
  rsvps: Rsvp[];
  totalCount: number;
  totalGuests: number;
}

export async function getRsvpsForShow(showId: number): Promise<RsvpSummary> {
  const rsvps = await sql<Rsvp[]>`
    select id, show_id, name, email, guests, email_list_opt_in, confirmation_email_sent_at, created_at
    from rsvps
    where show_id = ${showId}
    order by created_at desc
  `;
  const totalGuests = rsvps.reduce((sum, r) => sum + r.guests, 0);
  return { rsvps, totalCount: rsvps.length, totalGuests };
}

// For admin backfill of RSVPs collected outside the public form (door list,
// phone, etc.) — unlike /api/rsvp, this never sends a confirmation email or
// touches Mailchimp, since the admin is recording something that already happened.
export async function createRsvp(input: {
  showId: number;
  name: string;
  email: string;
  guests: number;
  emailListOptIn: boolean;
}): Promise<Rsvp> {
  const [row] = await sql<Rsvp[]>`
    insert into rsvps (show_id, name, email, guests, email_list_opt_in)
    values (${input.showId}, ${input.name}, ${input.email}, ${input.guests}, ${input.emailListOptIn})
    returning id, show_id, name, email, guests, email_list_opt_in, confirmation_email_sent_at, created_at
  `;
  return row;
}

export async function deleteRsvp(id: number): Promise<boolean> {
  const result = await sql`delete from rsvps where id = ${id}`;
  return result.count > 0;
}
