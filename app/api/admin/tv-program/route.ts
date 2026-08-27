import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getGlobalProgram, isTvMode, type ScheduleWindow, type BoardRow } from '@/lib/tv-program';

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

export async function GET() {
  return NextResponse.json(await getGlobalProgram());
}

export async function PATCH(request: Request) {
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

  // The seed migration guarantees the global row exists; update it in place.
  const rows = await sql`
    update tv_program set ${setClause}, updated_at = now()
    where show_id is null
    returning id
  `;
  if (rows.length === 0) {
    // Defensive: recreate the global row if it went missing, then re-apply.
    await sql`insert into tv_program (show_id, default_mode) values (null, 'screensaver') on conflict do nothing`;
    await sql`update tv_program set ${setClause}, updated_at = now() where show_id is null`;
  }
  return NextResponse.json({ ok: true });
}
