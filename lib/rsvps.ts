import { sql } from './db';

export interface Rsvp {
  id: number;
  show_id: number;
  name: string;
  email: string;
  guests: number;
  email_list_opt_in: boolean;
  arrived: boolean;
  arrived_at: string | null;
  paid: boolean;
  paid_at: string | null;
  confirmation_email_sent_at: string | null;
  created_at: string;
}

// Shared column list so every read returns the full Rsvp shape.
const RSVP_COLUMNS = sql`
  id, show_id, name, email, guests, email_list_opt_in,
  arrived, arrived_at, paid, paid_at, confirmation_email_sent_at, created_at
`;

export interface RsvpSummary {
  rsvps: Rsvp[];
  totalCount: number;
  totalGuests: number;
}

export async function getRsvpsForShow(showId: number): Promise<RsvpSummary> {
  const rsvps = await sql<Rsvp[]>`
    select ${RSVP_COLUMNS}
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
    returning ${RSVP_COLUMNS}
  `;
  return row;
}

export async function updateRsvp(
  id: number,
  input: { name: string; email: string; guests: number; emailListOptIn: boolean }
): Promise<Rsvp | null> {
  const [row] = await sql<Rsvp[]>`
    update rsvps
    set name = ${input.name}, email = ${input.email}, guests = ${input.guests}, email_list_opt_in = ${input.emailListOptIn}
    where id = ${id}
    returning ${RSVP_COLUMNS}
  `;
  return row ?? null;
}

// Door-list toggles: check someone in when they arrive, and mark them paid by
// hand. Each stamps/clears an `_at` timestamp alongside the boolean so we know
// when it happened. Return the updated row (null if the RSVP doesn't exist).
export async function setRsvpArrived(id: number, arrived: boolean): Promise<Rsvp | null> {
  const [row] = await sql<Rsvp[]>`
    update rsvps
    set arrived = ${arrived}, arrived_at = ${arrived ? sql`now()` : null}
    where id = ${id}
    returning ${RSVP_COLUMNS}
  `;
  return row ?? null;
}

export async function setRsvpPaid(id: number, paid: boolean): Promise<Rsvp | null> {
  const [row] = await sql<Rsvp[]>`
    update rsvps
    set paid = ${paid}, paid_at = ${paid ? sql`now()` : null}
    where id = ${id}
    returning ${RSVP_COLUMNS}
  `;
  return row ?? null;
}

export async function deleteRsvp(id: number): Promise<boolean> {
  const result = await sql`delete from rsvps where id = ${id}`;
  return result.count > 0;
}
