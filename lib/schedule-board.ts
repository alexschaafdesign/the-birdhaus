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

