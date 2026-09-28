import { sql } from './db';

// TV programming (070_tv_program.sql). The /tv display is authored, not
// derived: a program picks which MODE is on the tube, and each mode's content
// is edited by hand. Phase 1 exposes the global default program + global cards.

export type TvMode = 'screensaver' | 'board' | 'cards';
export const TV_MODES: readonly TvMode[] = ['screensaver', 'board', 'cards'];
export function isTvMode(v: unknown): v is TvMode {
  return typeof v === 'string' && (TV_MODES as readonly string[]).includes(v);
}

// A schedule window: the mode takes effect at `from` (24h "HH:MM" venue-local)
// and holds until the next window. Before the first window, default_mode.
export interface ScheduleWindow {
  from: string;
  mode: TvMode;
}

export interface BoardRow {
  time: string;
  label: string;
  // Render as a muted "secondary" note on the tube (doors, house clear, etc.).
  secondary?: boolean;
}

export interface TvProgram {
  defaultMode: TvMode;
  schedule: ScheduleWindow[];
  overrideMode: TvMode | null;
  // When set and in the past, the override is treated as cleared. ISO string.
  overrideExpiresAt: string | null;
  boardTitle: string | null;
  boardRows: BoardRow[];
}

// Is the override still in force (set and not expired) at this instant?
export function overrideActive(program: TvProgram, at: Date = new Date()): boolean {
  if (!program.overrideMode) return false;
  if (!program.overrideExpiresAt) return true;
  return new Date(program.overrideExpiresAt).getTime() > at.getTime();
}

export interface TvCard {
  id: number;
  headline: string;
  subtext: string | null;
  image: string | null;
  sort: number;
  active: boolean;
}

// Coerce a stored jsonb schedule into clean, valid windows (drop anything
// malformed rather than trusting the column blindly).
function parseSchedule(value: unknown): ScheduleWindow[] {
  if (!Array.isArray(value)) return [];
  const out: ScheduleWindow[] = [];
  for (const w of value) {
    if (w && typeof w === 'object' && typeof (w as ScheduleWindow).from === 'string' && isTvMode((w as ScheduleWindow).mode)) {
      out.push({ from: (w as ScheduleWindow).from, mode: (w as ScheduleWindow).mode });
    }
  }
  return out;
}

function parseBoardRows(value: unknown): BoardRow[] {
  if (!Array.isArray(value)) return [];
  const out: BoardRow[] = [];
  for (const r of value) {
    if (r && typeof r === 'object') {
      const time = typeof (r as BoardRow).time === 'string' ? (r as BoardRow).time : '';
      const label = typeof (r as BoardRow).label === 'string' ? (r as BoardRow).label : '';
      const secondary = (r as BoardRow).secondary === true;
      if (time || label) out.push(secondary ? { time, label, secondary } : { time, label });
    }
  }
  return out;
}

interface ProgramRow {
  default_mode: string;
  schedule: unknown;
  override_mode: string | null;
  override_expires_at: Date | string | null;
  board_title: string | null;
  board_rows: unknown;
}

function rowToProgram(row: ProgramRow): TvProgram {
  return {
    defaultMode: isTvMode(row.default_mode) ? row.default_mode : 'screensaver',
    schedule: parseSchedule(row.schedule),
    overrideMode: isTvMode(row.override_mode) ? row.override_mode : null,
    overrideExpiresAt: row.override_expires_at ? new Date(row.override_expires_at).toISOString() : null,
    boardTitle: row.board_title,
    boardRows: parseBoardRows(row.board_rows),
  };
}

export function blankProgram(): TvProgram {
  return {
    defaultMode: 'screensaver',
    schedule: [],
    overrideMode: null,
    overrideExpiresAt: null,
    boardTitle: null,
    boardRows: [],
  };
}

// A program by scope: showId null = the global default program; a number = that
// show's program. Returns null when no row exists for the scope. `is not
// distinct from` makes the null case a real equality match.
export async function getProgram(showId: number | null): Promise<TvProgram | null> {
  const [row] = await sql<ProgramRow[]>`
    select default_mode, schedule, override_mode, override_expires_at, board_title, board_rows
    from tv_program where show_id is not distinct from ${showId}
  `;
  return row ? rowToProgram(row) : null;
}

// The global default program (seeded by the migration; blank fallback if gone).
export async function getGlobalProgram(): Promise<TvProgram> {
  return (await getProgram(null)) ?? blankProgram();
}

// A program to edit in the admin — the scope's row, or a blank to fill in (the
// row gets created on first save).
export async function getProgramOrBlank(showId: number | null): Promise<TvProgram> {
  return (await getProgram(showId)) ?? blankProgram();
}

// The venue day, rolling at midnight America/Chicago (matches /api/tv's date).
export function getVenueToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// What the tube is actually serving right now: tonight's show program if a show
// dated today has one, else the global program. The global admin uses this so
// its override controls act on what's LIVE — a show program outranks global on
// its date, so a "global" force would otherwise never reach the tube.
export interface LiveTubeTarget {
  showId: number | null;
  title: string | null;
  program: TvProgram;
}
export async function getLiveTubeTarget(): Promise<LiveTubeTarget> {
  const today = getVenueToday();
  const [showRow] = await sql<Array<{ id: number; title: string | null }>>`
    select id, title from shows where date = ${today} order by id asc limit 1
  `;
  const showId = showRow ? Number(showRow.id) : null;
  const showProgram = showId !== null ? await getProgram(showId) : null;
  if (showProgram) return { showId, title: showRow?.title ?? null, program: showProgram };
  return { showId: null, title: null, program: await getGlobalProgram() };
}

// Active cards for a scope, in display order (for the feed).
export async function getActiveCards(
  showId: number | null
): Promise<Array<{ headline: string; subtext: string | null; image: string | null }>> {
  const rows = await sql<Array<{ headline: string; subtext: string | null; image: string | null }>>`
    select headline, subtext, image
    from tv_cards
    where show_id is not distinct from ${showId} and active = true
    order by sort asc, id asc
  `;
  return rows.map((r) => ({ headline: r.headline, subtext: r.subtext, image: r.image }));
}

// All cards for a scope (active + parked) for the admin manager.
export async function getAllCards(showId: number | null): Promise<TvCard[]> {
  const rows = await sql<
    Array<{ id: number; headline: string; subtext: string | null; image: string | null; sort: number; active: boolean }>
  >`
    select id, headline, subtext, image, sort, active
    from tv_cards
    where show_id is not distinct from ${showId}
    order by sort asc, id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    headline: r.headline,
    subtext: r.subtext,
    image: r.image,
    sort: Number(r.sort),
    active: r.active,
  }));
}

// Minutes since midnight (the venue day rolls at midnight) for a 24h "HH:MM".
// null if unparseable.
const DAY_START_MIN = 0;
function slotOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  let mins = hh * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}

// Which mode a program resolves to at a given venue slot: override wins; else
// the last schedule window whose `from` has passed; else the default.
export function resolveMode(program: TvProgram, nowSlot: number): TvMode {
  if (program.overrideMode) return program.overrideMode;
  let mode = program.defaultMode;
  const windows = program.schedule
    .map((w) => ({ slot: slotOf(w.from), mode: w.mode }))
    .filter((w): w is { slot: number; mode: TvMode } => w.slot !== null)
    .sort((a, b) => a.slot - b.slot);
  for (const w of windows) {
    if (nowSlot >= w.slot) mode = w.mode;
  }
  return mode;
}

// Current venue-local slot (minutes since midnight) from a real instant.
export function venueNowSlot(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  let mins = hh * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}
