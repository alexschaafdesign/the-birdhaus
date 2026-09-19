// Standardizes clock times in a schedule's time cell: a bare hour gets ":00"
// (so "5pm" → "5:00pm"), while times that already have minutes, the am/pm
// suffix, range separators, and any non-numeric text (e.g. "Doors") are left
// exactly as typed. Runs on each hour token, so ranges like "8–8:30pm" become
// "8:00–8:30pm".
//
// Lives in its own module (no server deps) so client components — the portal
// schedule, the advance form's schedule check — can share it with the advance
// email and the TV board.
export function normalizeScheduleTime(time: string): string {
  return time.replace(/(\d{1,2})(:(\d{2}))?/g, (match, hour, minutes) =>
    minutes ? match : `${hour}:00`
  );
}
