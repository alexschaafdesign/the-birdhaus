import { sql } from './db';
import { getSavedScheduleRows } from './advance';
import { timesFromSchedule } from './schedule-board';

// Once a show has an Advance schedule, it's where doors / music times are set:
// after the schedule saves, copy its Doors row and first set onto the show's
// public doors_time / show_time (see timesFromSchedule). A time the schedule
// doesn't have is left alone. Returns whether the show row changed, so the
// caller can refresh the public pages.
export async function syncShowTimesFromSchedule(showId: number): Promise<boolean> {
  const { doorsTime, showTime } = timesFromSchedule(await getSavedScheduleRows(showId));
  if (!doorsTime && !showTime) return false;
  const rows = await sql<{ id: number }[]>`
    update shows set
      doors_time = coalesce(${doorsTime}, doors_time),
      show_time = coalesce(${showTime}, show_time),
      updated_at = now()
    where id = ${showId}
      and (
        doors_time is distinct from coalesce(${doorsTime}, doors_time)
        or show_time is distinct from coalesce(${showTime}, show_time)
      )
    returning id
  `;
  return rows.length > 0;
}
