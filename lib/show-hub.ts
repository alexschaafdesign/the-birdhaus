import crypto from 'crypto';
import { sql } from './db';
import { getShowById } from './shows';
import { getShowInputsState, type InputTotalLine, type InputItem } from './inputs';
import { getRsvpsForShow } from './rsvps';
import { normalizeAdvanceVars } from './advance';
import { getConfirmedSoundEngineer } from './sound-engineers';
import type { ScheduleRow } from './advance-email';

// The shareable band/engineer "show hub" (/hub/<token>). Read-only, token-gated,
// outside the admin auth gate — so it deliberately exposes only headcount for
// RSVPs (no attendee names/emails), plus the schedule, input needs, and venue
// logistics the lineup and sound engineer need day-of.

// Unguessable share token (URL/address-safe hex). App-side rather than a DB
// default so we don't need a pgcrypto extension on Neon (same as the advance
// reply token).
function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Returns the show's share token, generating + persisting one on first use.
export async function getOrCreateShareToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ share_token: string | null }>>`
    select share_token from shows where id = ${showId}
  `;
  if (!row) return null;
  if (row.share_token) return row.share_token;

  const token = generateShareToken();
  await sql`update shows set share_token = ${token} where id = ${showId}`;
  return token;
}

// Rotates the token, revoking any previously shared link.
export async function regenerateShareToken(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ id: number }>>`select id from shows where id = ${showId}`;
  if (!row) return null;
  const token = generateShareToken();
  await sql`update shows set share_token = ${token} where id = ${showId}`;
  return token;
}

export interface ShowHubData {
  show: {
    title: string;
    date: string | null;
    doorsTime: string | null;
    showTime: string | null;
    flyer: string | null;
    ticketUrl: string | null;
  };
  lineup: string[];
  soundEngineerName: string | null;
  schedule: ScheduleRow[];
  inputsTotal: InputTotalLine[];
  inputsByBand: Array<{ bandId: number; name: string; items: InputItem[] }>;
  // Headcount only — no attendee PII. `expected` sums each RSVP's party size
  // ("number of guests including you"), so it's the real expected turnout.
  rsvp: { count: number; expected: number };
}

// Assembles everything the hub renders, found by share token. Returns null if the
// token doesn't match a show.
export async function getShowHubData(token: string): Promise<ShowHubData | null> {
  const [row] = await sql<Array<{ id: number }>>`
    select id from shows where share_token = ${token} limit 1
  `;
  if (!row) return null;
  const showId = Number(row.id);

  const [show, inputs, rsvp, engineer, advanceRows] = await Promise.all([
    getShowById(showId),
    getShowInputsState(showId),
    getRsvpsForShow(showId),
    getConfirmedSoundEngineer(showId),
    sql<Array<{ vars: unknown }>>`select vars from show_advances where show_id = ${showId}`,
  ]);
  if (!show) return null;

  const vars = normalizeAdvanceVars(advanceRows[0]?.vars);

  return {
    show: {
      title: show.title,
      date: show.date ?? null,
      doorsTime: show.doorsTime ?? null,
      showTime: show.showTime ?? null,
      flyer: show.flyer ?? null,
      ticketUrl: show.ticketUrl ?? null,
    },
    lineup: inputs?.bands.map((b) => b.name) ?? [],
    // The advance's per-show engineer name override wins, then the confirmed one.
    soundEngineerName: vars.sound_engineer.trim() || engineer?.name || null,
    schedule: vars.schedule,
    inputsTotal: inputs?.total ?? [],
    inputsByBand: inputs?.bands.map((b) => ({ bandId: b.bandId, name: b.name, items: b.items })) ?? [],
    rsvp: { count: rsvp.totalCount, expected: rsvp.totalGuests },
  };
}
