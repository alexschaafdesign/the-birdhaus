// Repeating requests: the dates a series falls on. PURE (client-safe; the
// booking page previews with it): tested.
//
// The anchor is the block the band picked. Weekly / every other week keep
// the weekday; monthly keeps "the nth weekday" (3rd Tuesday), and an anchor
// on a 5th weekday becomes "the last <weekday>". Every occurrence keeps the
// anchor's Chicago wall time (6pm stays 6pm across DST). A series ends on a
// date or after a count, both including the anchor.

import { wallTimeToUtc } from '../local-time.ts';
import { TIME_ZONE, addDays, chicagoDate, chicagoTime, weekdayOf } from './availability.ts';

export type Freq = 'weekly' | 'biweekly' | 'monthly_nth';

export interface SeriesRule {
  freq: Freq;
  until?: string; // "YYYY-MM-DD", inclusive
  count?: number;
}

export const MAX_OCCURRENCES = 52;
const MAX_SPAN_DAYS = 366;

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based here
}

// 1..5 = which <weekday> of its month the date is.
export function nthOfMonth(date: string): number {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

// The nth (1–4) or last (n = 5) <weekday> in a month, or null when a 5th
// doesn't exist (only "last" is asked as 5, so this never happens for it).
function nthWeekdayIn(y: number, m: number, weekday: number, n: number): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  if (n >= 5) {
    const last = daysInMonth(y, m);
    const wdLast = weekdayOf(`${y}-${pad(m)}-${pad(last)}`);
    const day = last - ((wdLast - weekday + 7) % 7);
    return `${y}-${pad(m)}-${pad(day)}`;
  }
  const wdFirst = weekdayOf(`${y}-${pad(m)}-01`);
  const day = 1 + ((weekday - wdFirst + 7) % 7) + (n - 1) * 7;
  return `${y}-${pad(m)}-${pad(day)}`;
}

// "Weekly on Wednesdays", "Every other Wednesday", "Monthly on the 3rd Tuesday".
export function describeRule(anchorDate: string, freq: Freq): string {
  const wd = WEEKDAY[weekdayOf(anchorDate)];
  if (freq === 'weekly') return `Weekly on ${wd}s`;
  if (freq === 'biweekly') return `Every other ${wd}`;
  const n = nthOfMonth(anchorDate);
  return `Monthly on the ${n >= 5 ? 'last' : ORDINAL[n]} ${wd}`;
}

// Chicago dates of every occurrence, anchor first.
export function occurrenceDates(anchorDate: string, rule: SeriesRule): string[] {
  const limitCount = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const hardEnd = addDays(anchorDate, MAX_SPAN_DAYS);
  const until = rule.until && rule.until < hardEnd ? rule.until : hardEnd;
  const out: string[] = [];

  if (rule.freq === 'monthly_nth') {
    const weekday = weekdayOf(anchorDate);
    const n = Math.min(nthOfMonth(anchorDate), 5);
    let y = Number(anchorDate.slice(0, 4));
    let m = Number(anchorDate.slice(5, 7));
    while (out.length < limitCount) {
      const d = nthWeekdayIn(y, m, weekday, n);
      if (d > until) break;
      if (d >= anchorDate) out.push(d);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }

  const step = rule.freq === 'weekly' ? 7 : 14;
  for (let d = anchorDate; d <= until && out.length < limitCount; d = addDays(d, step)) out.push(d);
  return out;
}

// Occurrence start instants at the anchor's Chicago wall time.
export function occurrenceStarts(anchorStart: Date, rule: SeriesRule): Date[] {
  const date = chicagoDate(anchorStart);
  const [h, m] = chicagoTime(anchorStart).split(':').map(Number);
  return occurrenceDates(date, rule).map((d) => wallTimeToUtc(d, h, m, TIME_ZONE));
}
