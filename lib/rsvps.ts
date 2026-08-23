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
  arrived_count: number;
  paid: boolean;
  paid_at: string | null;
  confirmation_email_sent_at: string | null;
  buyer_email: string | null;
  created_at: string;
}

// Shared column list so every read returns the full Rsvp shape.
const RSVP_COLUMNS = sql`
  id, show_id, name, email, guests, email_list_opt_in,
  arrived, arrived_at, arrived_count, paid, paid_at, confirmation_email_sent_at, buyer_email, created_at
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

// Door kiosk: bump how many people from this RSVP have shown up (a party of 3
// taps +1 three times; the − button walks it back on a mis-tap). Clamped at 0 so
// it can never go negative. Kept scoped to the show the door token authorized, so
// a token for one show can't touch another show's RSVPs. `arrived`/`arrived_at`
// are kept in sync (arrived = count > 0) so the admin door-list UI still lines up.
export async function bumpRsvpArrivedCount(
  id: number,
  showId: number,
  delta: number
): Promise<Rsvp | null> {
  const [row] = await sql<Rsvp[]>`
    update rsvps
    set arrived_count = greatest(0, arrived_count + ${delta}),
        arrived = greatest(0, arrived_count + ${delta}) > 0,
        arrived_at = case
          when greatest(0, arrived_count + ${delta}) > 0 and arrived_at is null then now()
          when greatest(0, arrived_count + ${delta}) = 0 then null
          else arrived_at
        end
    where id = ${id} and show_id = ${showId}
    returning ${RSVP_COLUMNS}
  `;
  return row ?? null;
}

// Manual purchase match: credit Square purchases made with `buyerEmail` to this
// RSVP (pass null to unlink). Stored lowercased so matching stays case-insensitive.
export async function setRsvpBuyerEmail(id: number, buyerEmail: string | null): Promise<Rsvp | null> {
  const [row] = await sql<Rsvp[]>`
    update rsvps
    set buyer_email = ${buyerEmail ? buyerEmail.toLowerCase() : null}
    where id = ${id}
    returning ${RSVP_COLUMNS}
  `;
  return row ?? null;
}

export async function deleteRsvp(id: number): Promise<boolean> {
  const result = await sql`delete from rsvps where id = ${id}`;
  return result.count > 0;
}
