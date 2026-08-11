import { sql } from './db';
import { getShowById } from './shows';
import { getShowInputsState, type InputTotalLine, type InputItem } from './inputs';
import { getRsvpsForShow } from './rsvps';
import { normalizeAdvanceVars } from './advance';
import { getConfirmedSoundEngineer } from './sound-engineers';
import { getShowIdByShareToken } from './share-token';
import { getPortalThread, type PortalMessage } from './hub-portal';
import type { ScheduleRow } from './advance-email';

// The shareable band/engineer "show hub" (/hub/<token>). Read-only, token-gated,
// outside the admin auth gate — so it deliberately exposes only headcount for
// RSVPs (no attendee names/emails), plus the schedule, input needs, and venue
// logistics the lineup and sound engineer need day-of. Token get/create lives in
// lib/share-token.ts (imported by the advance renderer, which this module imports).

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
  inputsByBand: Array<{
    bandId: number;
    name: string;
    items: InputItem[];
    // Stage-plot / input-list files already on file for this band (emailed in or
    // uploaded via the portal), so the portal can show "your files" per band.
    stagePlotAttachments: Array<{ filename: string | null; url: string; contentType: string | null }>;
  }>;
  // Headcount only — no attendee PII. `expected` sums each RSVP's party size
  // ("number of guests including you"), so it's the real expected turnout.
  rsvp: { count: number; expected: number };
  // The advance thread, sanitized for the portal (no email addresses) so bands
  // and Alex can message back and forth without email.
  messages: PortalMessage[];
}

// Assembles everything the hub renders, found by share token. Returns null if the
// token doesn't match a show.
export async function getShowHubData(token: string): Promise<ShowHubData | null> {
  const showId = await getShowIdByShareToken(token);
  if (showId === null) return null;

  const [show, inputs, rsvp, engineer, advanceRows, messages] = await Promise.all([
    getShowById(showId),
    getShowInputsState(showId),
    getRsvpsForShow(showId),
    getConfirmedSoundEngineer(showId),
    sql<Array<{ vars: unknown }>>`select vars from show_advances where show_id = ${showId}`,
    getPortalThread(showId),
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
    inputsByBand:
      inputs?.bands.map((b) => ({
        bandId: b.bandId,
        name: b.name,
        items: b.items,
        stagePlotAttachments: b.stagePlotAttachments,
      })) ?? [],
    rsvp: { count: rsvp.totalCount, expected: rsvp.totalGuests },
    messages,
  };
}
