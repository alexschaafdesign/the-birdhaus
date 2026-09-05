import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getProgramOrBlank, isTvMode, type ScheduleWindow, type BoardRow } from '@/lib/tv-program';
import { requireAdmin } from '@/lib/admin-session';

// Global TV program (070_tv_program.sql). Auth is enforced centrally in
// proxy.ts for all /api/admin/* routes. Phase 1 edits the single global row
// (show_id null); per-show programs come in phase 2.

const HHMM_RE = /^\d{1,2}:\d{2}$/;

function cleanSchedule(value: unknown): ScheduleWindow[] | null {
  if (!Array.isArray(value)) return null;
  const out: ScheduleWindow[] = [];
  for (const w of value) {
    if (!w || typeof w !== 'object') continue;
    const from = (w as ScheduleWindow).from;
    const mode = (w as ScheduleWindow).mode;
    if (typeof from !== 'string' || !HHMM_RE.test(from.trim()) || !isTvMode(mode)) return null;
    out.push({ from: from.trim(), mode });
  }
  return out;
}

function cleanBoardRows(value: unknown): BoardRow[] | null {
  if (!Array.isArray(value)) return null;
  const out: BoardRow[] = [];
  for (const r of value) {
    if (!r || typeof r !== 'object') continue;
    const time = typeof (r as BoardRow).time === 'string' ? (r as BoardRow).time.trim() : '';
    const label = typeof (r as BoardRow).label === 'string' ? (r as BoardRow).label.trim() : '';
    if (!time && !label) continue; // drop fully-empty rows
    out.push({ time, label });
  }
  return out;
}

// Scope: ?showId=N targets that show's program; absent/invalid = global.
function scopeShowId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const showId = scopeShowId(new URL(request.url).searchParams.get('showId'));
  return NextResponse.json(await getProgramOrBlank(showId));
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = [];

  if ('defaultMode' in body) {
    if (!isTvMode(body.defaultMode)) {
      return NextResponse.json({ error: 'Invalid default mode' }, { status: 400 });
    }
    assignments.push(sql`default_mode = ${body.defaultMode}`);
  }
  if ('overrideMode' in body) {
    // null clears the override; otherwise it must be a valid mode.
    if (body.overrideMode !== null && !isTvMode(body.overrideMode)) {
      return NextResponse.json({ error: 'Invalid override mode' }, { status: 400 });
    }
    assignments.push(sql`override_mode = ${body.overrideMode ?? null}`);
    // (Re)forcing or clearing a mode drops any stale expiry, unless the same
    // request also sets one below.
    if (!('overrideExpireInMinutes' in body)) {
      assignments.push(sql`override_expires_at = null`);
    }
  }
  if ('overrideExpireInMinutes' in body) {
    const mins = body.overrideExpireInMinutes;
    if (mins === null) {
      assignments.push(sql`override_expires_at = null`);
    } else if (Number.isFinite(mins) && mins > 0 && mins <= 24 * 60) {
      assignments.push(sql`override_expires_at = now() + (${mins} * interval '1 minute')`);
    } else {
      return NextResponse.json({ error: 'Invalid expiry' }, { status: 400 });
    }
  }
  if ('schedule' in body) {
    const schedule = cleanSchedule(body.schedule);
    if (schedule === null) {
      return NextResponse.json({ error: 'Invalid schedule' }, { status: 400 });
    }
    assignments.push(sql`schedule = ${sql.json(schedule as unknown as Parameters<typeof sql.json>[0])}`);
  }
  if ('boardTitle' in body) {
    const title = typeof body.boardTitle === 'string' ? body.boardTitle.trim() || null : null;
    assignments.push(sql`board_title = ${title}`);
  }
  if ('boardRows' in body) {
    const rows = cleanBoardRows(body.boardRows);
    if (rows === null) {
      return NextResponse.json({ error: 'Invalid board rows' }, { status: 400 });
    }
    assignments.push(sql`board_rows = ${sql.json(rows as unknown as Parameters<typeof sql.json>[0])}`);
  }

  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const setClause = assignments.reduce(
    (acc, fragment) => (acc === null ? fragment : sql`${acc}, ${fragment}`),
    null
  );

  const showId = scopeShowId(body.showId);
  // Ensure the scope's row exists — the global row is seeded, per-show rows are
  // created lazily on first edit — then apply the update.
  await sql`insert into tv_program (show_id, default_mode) values (${showId}, 'screensaver') on conflict do nothing`;
  await sql`update tv_program set ${setClause}, updated_at = now() where show_id is not distinct from ${showId}`;
  return NextResponse.json({ ok: true });
}
