import { sql } from './db';
import { getShowIdByDoorToken } from './door-token';
import { getShowPurchaseMatches } from './square';

// Everything the door check-in page renders, resolved by door token. Used by the
// door person (not guests), but the token is the only auth, so still keep the
// payload lean: names, headcounts, and payment status reduced server-side to a
// flag + ticket count — no emails or other contact info.

export interface DoorRsvp {
  id: number;
  name: string;
  guests: number;
  arrivedCount: number;
  // Admin-set "paid" flag (cash/comp/Venmo) — same as the Admin RSVPs toggle.
  paid: boolean;
  // Tickets bought through Square, matched by email. 0 = no purchase found.
  ticketsBought: number;
}

export interface DoorData {
  showId: number;
  title: string;
  date: string;
  doorsTime: string | null;
  rsvps: DoorRsvp[];
  walkinCount: number;
}

export async function getDoorData(token: string): Promise<DoorData | null> {
  const showId = await getShowIdByDoorToken(token);
  if (!showId) return null;

  const [show] = await sql<
    Array<{ id: number; title: string; date: string; doors_time: string | null; walkin_count: number }>
  >`
    select id, title, date::text as date, doors_time, walkin_count
    from shows
    where id = ${showId}
  `;
  if (!show) return null;

  const rows = await sql<
    Array<{ id: number; name: string; guests: number; arrived_count: number; paid: boolean; email: string; buyer_email: string | null }>
  >`
    select id, name, guests, arrived_count, paid, email, buyer_email
    from rsvps
    where show_id = ${showId}
    order by lower(name)
  `;

  // Same Square-purchase matching the Admin RSVPs tab uses; best-effort (empty on
  // failure). Emails feed the match here and never leave the server.
  const { purchasesByEmail } = await getShowPurchaseMatches(
    showId,
    rows.map((r) => ({ email: r.email, buyerEmail: r.buyer_email })),
  );

  return {
    showId,
    title: show.title,
    date: show.date,
    doorsTime: show.doors_time,
    walkinCount: Number(show.walkin_count),
    rsvps: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      guests: r.guests,
      arrivedCount: Number(r.arrived_count),
      paid: r.paid,
      ticketsBought: purchasesByEmail[r.email.trim().toLowerCase()]?.quantity ?? 0,
    })),
  };
}

// Door kiosk: bump the anonymous walk-in tally (people who never RSVP'd) for a
// show. Clamped at 0. Returns the new count.
export async function bumpWalkinCount(showId: number, delta: number): Promise<number> {
  const [row] = await sql<Array<{ walkin_count: number }>>`
    update shows
    set walkin_count = greatest(0, walkin_count + ${delta})
    where id = ${showId}
    returning walkin_count
  `;
  return row ? Number(row.walkin_count) : 0;
}
