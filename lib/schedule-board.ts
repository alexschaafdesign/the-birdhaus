import type { ScheduleRow } from './advance-email';

// Distills the Portal schedule down to the TV board: drop the load-in and
// soundcheck rows (the tube only wants what an attendee cares about), keep the
// band sets as primary rows, and mark Doors / House clear as muted "secondary"
// bookends — matching how buildScheduleTemplate lays the board out, but using
// the real times the admin entered on the portal rather than a template.
// Shared by the TV board's prefill and the show-day auto board (lib/tv-feed).
function isSoundcheckRow(label: string): boolean {
  return /soundcheck|sound\s*check|load[-\s]?in|sound engineer/i.test(label);
}
function isBookendRow(label: string): boolean {
  return /\bdoors\b|house\s*(clear|close)/i.test(label);
}
export function buildBoardFromSchedule(schedule: ScheduleRow[]): ScheduleRow[] {
  return schedule
    .filter((r) => (r.time.trim() || r.label.trim()) && !isSoundcheckRow(r.label))
    .map((r) => ({
      time: r.time,
      label: r.label,
      ...(isBookendRow(r.label) && { secondary: true }),
    }));
}


// The start of a schedule time as a show time: "8–8:30pm" → "8:00pm",
// "7pm" → "7:00pm", "10:45 PM" → "10:45pm". A start with no am/pm borrows the
// range end's ("8–8:30pm" is pm); none at all reads as pm (shows are evenings).
// null when there's no clock time in it.
export function scheduleStartTime(time: string): string | null {
  const [start, end = ''] = time.split(/\s*[–—-]\s*/);
  const m = start.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  const meridiem = (m[3] ?? end.match(/(am|pm)/i)?.[1] ?? 'pm').toLowerCase();
  return `${hour}:${m[2] ?? '00'}${meridiem}`;
}

// The show's public doors / music times, read off its Advance schedule: the
// Doors row, and the first set after it (the first row that isn't load-in, a
// soundcheck, doors or house clear). Once a show has a schedule these are its
// times, so the public page, the Portal header and the TV all agree. Either is
// null when the schedule doesn't have that row.
export function timesFromSchedule(schedule: ScheduleRow[]): { doorsTime: string | null; showTime: string | null } {
  const rows = schedule.filter((r) => r.time.trim());
  const doorsIndex = rows.findIndex((r) => /\bdoors\b/i.test(r.label));
  const doorsTime = doorsIndex >= 0 ? scheduleStartTime(rows[doorsIndex].time) : null;
  const firstSet = rows
    .slice(doorsIndex + 1)
    .find((r) => r.label.trim() && !isSoundcheckRow(r.label) && !isBookendRow(r.label));
  const showTime = firstSet ? scheduleStartTime(firstSet.time) : null;
  return { doorsTime, showTime };
}
