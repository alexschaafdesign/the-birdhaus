import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBusyTimes, mergeIntervals } from './ics.ts';

const FROM = new Date('2026-11-01T00:00:00Z');
const TO = new Date('2027-01-31T00:00:00Z');

// Apple Calendar publishes a VTIMEZONE block like this one.
const CHICAGO_VTZ = `BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:DAYLIGHT
TZOFFSETFROM:-0600
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
DTSTART:20070311T020000
TZNAME:CDT
TZOFFSETTO:-0500
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0500
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
DTSTART:20071104T020000
TZNAME:CST
TZOFFSETTO:-0600
END:STANDARD
END:VTIMEZONE`;

function cal(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Apple Inc.//macOS 15//EN',
    'X-WR-CALNAME:Alex',
    CHICAGO_VTZ,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function ev(uid: string, lines: string[]): string {
  return ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20261101T000000Z', 'SUMMARY:Private thing', ...lines, 'END:VEVENT'].join(
    '\r\n',
  );
}

const iso = (ivs: { start: Date; end: Date }[]) => ivs.map((i) => [i.start.toISOString(), i.end.toISOString()]);

test('UTC times', () => {
  const out = parseBusyTimes(cal(ev('a', ['DTSTART:20261120T180000Z', 'DTEND:20261120T190000Z'])), FROM, TO);
  assert.deepEqual(iso(out), [['2026-11-20T18:00:00.000Z', '2026-11-20T19:00:00.000Z']]);
});

test('TZID defined by the feed (Apple style), on both sides of DST', () => {
  const out = parseBusyTimes(
    cal(
      ev('a', ['DTSTART;TZID=America/Chicago:20261120T180000', 'DTEND;TZID=America/Chicago:20261120T200000']),
      ev('b', ['DTSTART;TZID=America/Chicago:20270115T090000', 'DURATION:PT1H']),
    ),
    FROM,
    new Date('2027-04-01T00:00:00Z'),
  );
  assert.deepEqual(iso(out), [
    ['2026-11-21T00:00:00.000Z', '2026-11-21T02:00:00.000Z'],
    ['2027-01-15T15:00:00.000Z', '2027-01-15T16:00:00.000Z'],
  ]);
});

test('a TZID the feed does not define is read as that IANA zone', () => {
  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ev('a', ['DTSTART;TZID=America/New_York:20261120T180000', 'DTEND;TZID=America/New_York:20261120T190000']),
    'END:VCALENDAR',
  ].join('\r\n');
  assert.deepEqual(iso(parseBusyTimes(text, FROM, TO)), [['2026-11-20T23:00:00.000Z', '2026-11-21T00:00:00.000Z']]);
});

test('floating times are Chicago', () => {
  const out = parseBusyTimes(cal(ev('a', ['DTSTART:20261120T180000', 'DTEND:20261120T190000'])), FROM, TO);
  assert.deepEqual(iso(out), [['2026-11-21T00:00:00.000Z', '2026-11-21T01:00:00.000Z']]);
});

test('all-day events block whole Chicago days', () => {
  const out = parseBusyTimes(
    cal(
      ev('a', ['DTSTART;VALUE=DATE:20261121', 'DTEND;VALUE=DATE:20261123']), // Sat–Sun
      ev('b', ['DTSTART;VALUE=DATE:20261128']), // no DTEND: one day
    ),
    FROM,
    TO,
  );
  assert.deepEqual(iso(out), [
    ['2026-11-21T06:00:00.000Z', '2026-11-23T06:00:00.000Z'],
    ['2026-11-28T06:00:00.000Z', '2026-11-29T06:00:00.000Z'],
  ]);
});

test('weekly recurrence with EXDATE, a moved occurrence and a cancelled one', () => {
  const out = parseBusyTimes(
    cal(
      ev('w', [
        'DTSTART;TZID=America/Chicago:20261102T190000', // Mondays 7–8pm
        'DTEND;TZID=America/Chicago:20261102T200000',
        'RRULE:FREQ=WEEKLY;COUNT=5',
        'EXDATE;TZID=America/Chicago:20261109T190000',
      ]),
      ev('w', [
        'RECURRENCE-ID;TZID=America/Chicago:20261116T190000',
        'DTSTART;TZID=America/Chicago:20261117T100000', // moved to Tue 10–11am
        'DTEND;TZID=America/Chicago:20261117T110000',
      ]),
      ev('w', [
        'RECURRENCE-ID;TZID=America/Chicago:20261123T190000',
        'DTSTART;TZID=America/Chicago:20261123T190000',
        'DTEND;TZID=America/Chicago:20261123T200000',
        'STATUS:CANCELLED',
      ]),
    ),
    FROM,
    TO,
  );
  assert.deepEqual(iso(out), [
    ['2026-11-03T01:00:00.000Z', '2026-11-03T02:00:00.000Z'], // Nov 2 (first Monday after fall-back)
    ['2026-11-17T16:00:00.000Z', '2026-11-17T17:00:00.000Z'], // moved
    ['2026-12-01T01:00:00.000Z', '2026-12-01T02:00:00.000Z'], // Nov 30
  ]);
});

test('an old open-ended rule is expanded into the range only', () => {
  const out = parseBusyTimes(
    cal(
      ev('d', [
        'DTSTART;TZID=America/Chicago:20150105T080000',
        'DTEND;TZID=America/Chicago:20150105T090000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
      ]),
    ),
    new Date('2026-11-16T00:00:00Z'),
    new Date('2026-11-30T00:00:00Z'),
  );
  assert.deepEqual(iso(out), [
    ['2026-11-16T14:00:00.000Z', '2026-11-16T15:00:00.000Z'],
    ['2026-11-23T14:00:00.000Z', '2026-11-23T15:00:00.000Z'],
  ]);
});

test('cancelled events and events outside the range are skipped', () => {
  const out = parseBusyTimes(
    cal(
      ev('c', ['DTSTART:20261120T180000Z', 'DTEND:20261120T190000Z', 'STATUS:CANCELLED']),
      ev('old', ['DTSTART:20250101T180000Z', 'DTEND:20250101T190000Z']),
      ev('far', ['DTSTART:20280101T180000Z', 'DTEND:20280101T190000Z']),
      ev('zero', ['DTSTART:20261121T180000Z']), // timed, no end: an instant
    ),
    FROM,
    TO,
  );
  assert.deepEqual(out, []);
});

test('only times come out: no titles or other fields', () => {
  const out = parseBusyTimes(cal(ev('a', ['DTSTART:20261120T180000Z', 'DTEND:20261120T190000Z'])), FROM, TO);
  assert.deepEqual(Object.keys(out[0]).sort(), ['end', 'start']);
  assert.ok(!JSON.stringify(out).includes('Private'));
});

test('overlapping events merge', () => {
  const d = (s: string) => new Date(s);
  assert.deepEqual(
    iso(
      mergeIntervals([
        { start: d('2026-11-20T18:00:00Z'), end: d('2026-11-20T19:00:00Z') },
        { start: d('2026-11-20T18:30:00Z'), end: d('2026-11-20T20:00:00Z') },
        { start: d('2026-11-20T20:00:00Z'), end: d('2026-11-20T21:00:00Z') },
        { start: d('2026-11-21T10:00:00Z'), end: d('2026-11-21T11:00:00Z') },
      ]),
    ),
    [
      ['2026-11-20T18:00:00.000Z', '2026-11-20T21:00:00.000Z'],
      ['2026-11-21T10:00:00.000Z', '2026-11-21T11:00:00.000Z'],
    ],
  );
});

test('text that is not iCalendar throws (the feed counts as failed)', () => {
  assert.throws(() => parseBusyTimes('<html>Sign in</html>', FROM, TO));
});
