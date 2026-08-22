import { sql } from './db';
import { getShowIdByDoorToken } from './door-token';

// Everything the door check-in kiosk renders, resolved by door token. Deliberately
// omits emails — the kiosk sits in the open and may be handed to guests, so it only
// ever exposes names + headcounts, never contact info.

export interface DoorRsvp {
  id: number;
  name: string;
  guests: number;
  arrivedCount: number;
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

  const rows = await sql<Array<{ id: number; name: string; guests: number; arrived_count: number }>>`
    select id, name, guests, arrived_count
    from rsvps
    where show_id = ${showId}
    order by lower(name)
  `;

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
