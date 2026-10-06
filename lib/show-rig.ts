import { sql } from './db';

// A show's recording rig + camera crew (094: show_rig, show_credits), edited in
// the Recording section of the show's Contacts tab and read by the archive.
//
// show_rig counts are nullable on purpose: unknown stays unknown. The admin UI
// suggests 18 channels only while a show has no show_rig row, and nothing is
// written until that section is saved.

export const CAMERA_ROLE = 'camera';

// Inclusive bounds of the smallint columns / show_credits name check.
const MAX_COUNT = 32767;
const MAX_NAME = 120;

export interface CameraOperator {
  name: string;
  // Optional link to a crew/staff account (users.id).
  userId: number | null;
}

export interface ShowRecording {
  // null when the show has no show_rig row yet.
  rig: { cameraCount: number | null; channelCount: number | null } | null;
  cameraOperators: CameraOperator[];
}

export interface CrewAccountOption {
  id: number;
  name: string;
  email: string;
}

export async function getShowRecording(showId: number): Promise<ShowRecording> {
  const [[rig], operators] = await Promise.all([
    sql<Array<{ camera_count: number | null; channel_count: number | null }>>`
      select camera_count, channel_count from show_rig where show_id = ${showId}
    `,
    sql<Array<{ name: string; user_id: string | null }>>`
      select name, user_id from show_credits
      where show_id = ${showId} and role = ${CAMERA_ROLE}
      order by position, name
    `,
  ]);
  return {
    rig: rig ? { cameraCount: rig.camera_count, channelCount: rig.channel_count } : null,
    cameraOperators: operators.map((o) => ({
      name: o.name,
      userId: o.user_id != null ? Number(o.user_id) : null,
    })),
  };
}

// Accounts a camera credit may link to: crew or staff, not disabled.
export async function listCrewAccountOptions(): Promise<CrewAccountOption[]> {
  const rows = await sql<Array<{ id: string; name: string | null; email: string }>>`
    select id, name, email from users
    where status <> 'disabled'
      and exists (
        select 1 from user_roles r where r.user_id = users.id and r.role in ('crew', 'staff')
      )
    order by name asc, id asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name ?? r.email, email: r.email }));
}

export type RecordingInput = {
  cameraCount: number | null;
  channelCount: number | null;
  cameraOperators: CameraOperator[];
};

function parseCount(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : 'invalid';
}

// Validates the request body, returning the clean input or a message to show
// the operator. Names are trimmed; blank rows are dropped; a name listed twice
// (ignoring case) is an error, since show_credits keys on (show, role, name).
export function parseRecordingInput(body: unknown): RecordingInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  const cameraCount = parseCount(b.cameraCount);
  if (cameraCount === 'invalid') return { error: 'Camera count must be a whole number, 0 or more.' };
  const channelCount = parseCount(b.channelCount);
  if (channelCount === 'invalid') return { error: 'Channel count must be a whole number, 0 or more.' };

  if (!Array.isArray(b.cameraOperators)) return { error: 'Invalid camera operators' };
  const cameraOperators: CameraOperator[] = [];
  const seen = new Set<string>();
  for (const raw of b.cameraOperators) {
    if (!raw || typeof raw !== 'object') return { error: 'Invalid camera operators' };
    const op = raw as Record<string, unknown>;
    const name = typeof op.name === 'string' ? op.name.trim() : '';
    if (!name) continue;
    if (name.length > MAX_NAME) return { error: `"${name.slice(0, 40)}…" is too long (max ${MAX_NAME}).` };
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `${name} is listed twice — each camera operator once.` };
    seen.add(key);
    const userId =
      typeof op.userId === 'number' && Number.isInteger(op.userId) && op.userId > 0 ? op.userId : null;
    cameraOperators.push({ name, userId });
  }

  return { cameraCount, channelCount, cameraOperators };
}

// Saves the whole Recording section in one transaction: upserts the show_rig
// row and replaces this show's camera credits (other roles are untouched).
// Throws 'unknown account' if a linked userId isn't a crew/staff account.
export async function saveShowRecording(showId: number, input: RecordingInput): Promise<void> {
  const linked = [...new Set(input.cameraOperators.map((o) => o.userId).filter((id): id is number => id != null))];
  await sql.begin(async (tx) => {
    if (linked.length > 0) {
      const ok = await tx<Array<{ id: string }>>`
        select id from users
        where id = any(${linked}) and status <> 'disabled'
          and exists (
            select 1 from user_roles r where r.user_id = users.id and r.role in ('crew', 'staff')
          )
      `;
      if (ok.length !== linked.length) throw new Error('unknown account');
    }

    await tx`
      insert into show_rig (show_id, camera_count, channel_count, updated_at)
      values (${showId}, ${input.cameraCount}, ${input.channelCount}, now())
      on conflict (show_id) do update set
        camera_count = excluded.camera_count,
        channel_count = excluded.channel_count,
        updated_at = now()
    `;
    await tx`delete from show_credits where show_id = ${showId} and role = ${CAMERA_ROLE}`;
    if (input.cameraOperators.length > 0) {
      const rows = input.cameraOperators.map((o, position) => ({
        show_id: showId,
        role: CAMERA_ROLE,
        name: o.name,
        user_id: o.userId,
        position,
      }));
      await tx`insert into show_credits ${tx(rows, 'show_id', 'role', 'name', 'user_id', 'position')}`;
    }
  });
}
