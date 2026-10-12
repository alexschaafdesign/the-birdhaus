// Local wall time -> UTC, DST-correct (no hardcoded offset). Shows store
// doors_time/show_time as free text ("7pm", "7:30 PM", "19:00"); these turn
// that into a real instant. Shared by the Square sync and the booking feed.

export function parseLocalTime(raw: string | null | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;
  const text = raw.trim();
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i) ?? text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (hour === 12) hour = 0;
    if (ampm === 'p') hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// How far ahead of UTC the zone is, in ms, at the given instant.
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// Interpret (dateStr, hour, minute) as a wall-clock time in timeZone and return
// the corresponding UTC instant. Two passes so DST transitions resolve cleanly.
export function wallTimeToUtc(dateStr: string, hour: number, minute: number, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  let offset = tzOffsetMs(timeZone, new Date(guess));
  offset = tzOffsetMs(timeZone, new Date(guess - offset));
  return new Date(guess - offset);
}
