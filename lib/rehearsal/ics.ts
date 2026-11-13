// Busy times from an iCalendar (.ics) feed: start/end instants only. PURE (no
// network) so it runs under `npm test`. Titles, locations, attendees and notes
// are never read, let alone stored.
//
// Every event that isn't STATUS:CANCELLED counts as busy, all-day events
// included (an all-day "Out of town" should block). Recurring events are
// expanded (RRULE/RDATE, EXDATE, moved or cancelled single occurrences).
// Floating times and all-day dates are read as Chicago wall time; a TZID the
// feed doesn't define is read as that IANA zone when it is one, else Chicago.

import ICAL from 'ical.js';
import { wallTimeToUtc } from '../local-time.ts';
import type { Interval } from './availability.ts';

const TIME_ZONE = 'America/Chicago';
// A daily event since 2010 is ~6k occurrences; more than this is a broken rule.
const MAX_OCCURRENCES_PER_EVENT = 20_000;

function isIanaZone(tzid: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function wall(t: ICAL.Time, tz: string): Date {
  const date = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  const base = wallTimeToUtc(date, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, tz);
  return new Date(base.getTime() + (t.isDate ? 0 : t.second * 1000));
}

// An ICAL.Time -> instant, without trusting the server's own time zone.
function toInstant(t: ICAL.Time, tzid: string | null): Date {
  if (t.isDate) return wall(t, TIME_ZONE);
  const zone = t.zone?.tzid;
  if (zone === 'UTC' || (zone && zone !== 'floating')) return t.toJSDate(); // Z or a VTIMEZONE the feed defines
  if (tzid && isIanaZone(tzid)) return wall(t, tzid);
  return wall(t, TIME_ZONE);
}

function tzidOf(event: ICAL.Component, prop: 'dtstart' | 'dtend'): string | null {
  const p = event.getFirstProperty(prop);
  const v = p?.getParameter('tzid');
  return typeof v === 'string' ? v : null;
}

function isCancelled(c: ICAL.Component): boolean {
  return String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

// All-day events with no DTEND last one day; timed events with neither DTEND
// nor DURATION are instants (RFC 5545) and block nothing.
function endFor(startTime: ICAL.Time, endTime: ICAL.Time | null, start: Date, tzid: string | null): Date {
  if (endTime) return toInstant(endTime, tzid);
  if (startTime.isDate) {
    const next = startTime.clone();
    next.adjust(1, 0, 0, 0);
    return toInstant(next, null);
  }
  return start;
}

// Parse a feed and return busy intervals overlapping [from, to), merged.
// Throws on text that isn't iCalendar, so the caller treats the feed as failed.
export function parseBusyTimes(text: string, from: Date, to: Date): Interval[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('not an iCalendar feed');
  const root = new ICAL.Component(ICAL.parse(text));

  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vtz);
    if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
  }

  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  const singles: ICAL.Event[] = [];
  for (const c of vevents) {
    const ev = new ICAL.Event(c);
    if (c.hasProperty('recurrence-id')) exceptions.push(ev);
    else if (ev.isRecurring()) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex); // orphaned override: treat as a one-off
  }

  const out: Interval[] = [];
  const keep = (iv: Interval) => {
    if (iv.end.getTime() > from.getTime() && iv.start.getTime() < to.getTime() && iv.end > iv.start) out.push(iv);
  };

  for (const ev of singles) {
    if (isCancelled(ev.component) || !ev.startDate) continue;
    const start = toInstant(ev.startDate, tzidOf(ev.component, 'dtstart'));
    keep({ start, end: endFor(ev.startDate, ev.endDate ?? null, start, tzidOf(ev.component, 'dtend')) });
  }

  for (const ev of masters.values()) {
    if (isCancelled(ev.component) || !ev.startDate) continue;
    const masterTzid = tzidOf(ev.component, 'dtstart');
    const it = ev.iterator();
    for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES_PER_EVENT; n++, next = it.next()) {
      // Stop on the occurrence's own (recurrence-id) time, not a moved one's.
      if (toInstant(next, masterTzid).getTime() >= to.getTime()) break;
      const d = ev.getOccurrenceDetails(next);
      const item = d.item;
      const startTzid = tzidOf(item.component, 'dtstart');
      const start = toInstant(d.startDate, startTzid);
      if (isCancelled(item.component)) continue;
      keep({ start, end: endFor(d.startDate, d.endDate ?? null, start, tzidOf(item.component, 'dtend') ?? startTzid) });
    }
  }

  return mergeIntervals(out);
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      out.push({ start: iv.start, end: iv.end });
    }
  }
  return out;
}
