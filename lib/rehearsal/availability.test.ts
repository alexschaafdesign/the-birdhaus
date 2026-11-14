import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAvailability,
  findConflicts,
  forBand,
  isOpenSpan,
  startOptions,
  subtract,
  chicagoDate,
  chicagoTime,
  type Availability,
  type Day,
  type EngineInput,
  type EngineBooking,
} from './availability.ts';

// Monday 2026-11-16, 9:00am Chicago (CST, UTC-6).
const NOW = new Date('2026-11-16T15:00:00Z');
const H = 3_600_000;

function base(over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    settings: {
      windowMinHours: 24,
      windowMaxWeeks: 8,
      showDayRule: 'from_time',
      showDayFrom: '16:00',
      startStepMinutes: 30,
      allowedLengths: [60, 120, 180, 240, 360],
      bufferMinutes: 30,
    },
    windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: '10:00', closes: '22:00', closed: false })),
    showDates: [],
    unavailableDays: [],
    blackouts: [],
    busy: { intervals: [], checked: true },
    bookings: [],
    ...over,
  };
}

function day(a: Availability, date: string): Day {
  const d = a.days.find((x) => x.date === date);
  assert.ok(d, `no day ${date}`);
  return d;
}

// "10:00–22:00, …" in Chicago wall time, for readable assertions.
function free(a: Availability, date: string): string {
  return day(a, date)
    .free.map((f) => `${chicagoTime(f.start)}–${chicagoTime(f.end) === '00:00' ? '24:00' : chicagoTime(f.end)}`)
    .join(', ');
}

function booking(over: Partial<EngineBooking> & Pick<EngineBooking, 'startsAt'>): EngineBooking {
  return {
    id: 1,
    bandId: 10,
    status: 'pending',
    endsAt: new Date(over.startsAt.getTime() + 3 * H),
    expiresAt: new Date('2026-11-20T00:00:00Z'),
    ...over,
  };
}

// Wed 2026-11-18 18:00 CST = 2026-11-19T00:00Z.
const WED_6PM = new Date('2026-11-19T00:00:00Z');

test('each day is open across its window', () => {
  const a = computeAvailability(base());
  assert.equal(free(a, '2026-11-18'), '10:00–22:00');
  assert.equal(day(a, '2026-11-18').window?.start.toISOString(), '2026-11-18T16:00:00.000Z');
});

test('a closed weekday has no free time; a window can close at midnight', () => {
  const windows = base().windows.map((w) =>
    w.weekday === 2 ? { ...w, closed: true } : w.weekday === 5 ? { ...w, closes: '24:00' } : w,
  );
  const a = computeAvailability(base({ windows }));
  assert.equal(free(a, '2026-11-17'), ''); // Tue
  assert.equal(day(a, '2026-11-17').window, null);
  assert.equal(free(a, '2026-11-20'), '10:00–24:00'); // Fri
});

test('inside 24h is not bookable (window); earlier today is past', () => {
  const a = computeAvailability(base());
  assert.equal(free(a, '2026-11-16'), ''); // today
  assert.equal(free(a, '2026-11-17'), '10:00–22:00'); // tomorrow from 9am+24h = 9am, window opens 10
  const later = computeAvailability(base({ now: new Date('2026-11-16T20:00:00Z') })); // 2pm Mon
  assert.equal(free(later, '2026-11-17'), '14:00–22:00');
  assert.deepEqual(
    day(later, '2026-11-16').blocked.map((b) => b.reason),
    ['past', 'window'],
  );
});

test('the window ends 8 weeks out', () => {
  const a = computeAvailability(base());
  assert.equal(a.days[a.days.length - 1].date, chicagoDate(new Date(NOW.getTime() + 8 * 7 * 24 * H)));
});

test('a show blocks from 16:00 by default; whole_day blocks it all', () => {
  const a = computeAvailability(base({ showDates: ['2026-11-21'] }));
  assert.equal(free(a, '2026-11-21'), '10:00–16:00');
  const whole = computeAvailability(base({ showDates: ['2026-11-21'], settings: { ...base().settings, showDayRule: 'whole_day' } }));
  assert.equal(free(whole, '2026-11-21'), '');
});

test('Not-available days, blackouts and busy times take their time out', () => {
  const a = computeAvailability(
    base({
      unavailableDays: ['2026-11-20'],
      blackouts: [{ start: new Date('2026-11-18T19:00:00Z'), end: new Date('2026-11-18T21:00:00Z') }], // Wed 1–3pm
      busy: { intervals: [{ start: new Date('2026-11-19T18:00:00Z'), end: new Date('2026-11-19T19:30:00Z') }], checked: true }, // Thu 12–1:30
    }),
  );
  assert.equal(free(a, '2026-11-20'), '');
  assert.equal(free(a, '2026-11-18'), '10:00–13:00, 15:00–22:00');
  assert.equal(free(a, '2026-11-19'), '10:00–12:00, 13:30–22:00');
  assert.deepEqual(
    day(a, '2026-11-18').blocked.map((b) => b.reason),
    ['blackout'],
  );
});

test('a multi-day blackout covers every day it touches', () => {
  const a = computeAvailability(
    base({ blackouts: [{ start: new Date('2026-11-18T20:00:00Z'), end: new Date('2026-11-20T18:00:00Z') }] }), // Wed 2pm → Fri noon
  );
  assert.equal(free(a, '2026-11-18'), '10:00–14:00');
  assert.equal(free(a, '2026-11-19'), '');
  assert.equal(free(a, '2026-11-20'), '12:00–22:00');
});

test('bookings hold their time plus the buffer on both sides', () => {
  const a = computeAvailability(base({ bookings: [booking({ startsAt: WED_6PM, bandId: 99 })] }));
  assert.equal(free(a, '2026-11-18'), '10:00–17:30, 21:30–22:00'); // 6–9pm + 30 min each side
  // 9:30–10pm is free but too short for the shortest length: no start offered there.
  assert.ok(startOptions(day(a, '2026-11-18').free, base().settings).every((o) => chicagoTime(o.start) < '17:00'));
  const noBuffer = computeAvailability(
    base({ bookings: [booking({ startsAt: WED_6PM })], settings: { ...base().settings, bufferMinutes: 0 } }),
  );
  assert.equal(free(noBuffer, '2026-11-18'), '10:00–18:00, 21:00–22:00');
});

test('expired, declined and cancelled bookings free their time', () => {
  for (const status of ['declined', 'cancelled', 'expired'] as const) {
    const a = computeAvailability(base({ bookings: [booking({ startsAt: WED_6PM, status })] }));
    assert.equal(free(a, '2026-11-18'), '10:00–22:00', status);
  }
  const lapsed = computeAvailability(base({ bookings: [booking({ startsAt: WED_6PM, expiresAt: new Date('2026-11-16T00:00:00Z') })] }));
  assert.equal(free(lapsed, '2026-11-18'), '10:00–22:00');
});

test("the viewer sees their own bookings; the band view has no reasons", () => {
  const a = computeAvailability(
    base({
      viewerBandId: 10,
      bookings: [booking({ id: 7, startsAt: WED_6PM, status: 'confirmed' })],
      busy: { intervals: [{ start: new Date('2026-11-19T18:00:00Z'), end: new Date('2026-11-19T19:00:00Z') }], checked: true },
    }),
  );
  assert.deepEqual(day(a, '2026-11-18').own.map((o) => [o.bookingId, o.state]), [[7, 'confirmed']]);
  const band = forBand(a);
  const json = JSON.stringify(band);
  assert.ok(!json.includes('busy') && !json.includes('reason') && !json.includes('blocked'));
  assert.equal(band.days.find((d) => d.date === '2026-11-18')?.own.length, 1);
});

test('a failed calendar check leaves time open and says so', () => {
  const a = computeAvailability(base({ busy: { intervals: [], checked: false } }));
  assert.equal(a.calendarChecked, false);
  assert.equal(free(a, '2026-11-18'), '10:00–22:00');
});

test('isOpenSpan: grid, allowed length, inside one stretch, inside the window', () => {
  const a = computeAvailability(base({ bookings: [booking({ startsAt: WED_6PM, bandId: 99 })] }));
  const s = base().settings;
  const wed = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 18, h + 6, m)); // Chicago CST
  assert.equal(isOpenSpan(a, s, wed(14), 180), true); // 2–5pm
  assert.equal(isOpenSpan(a, s, wed(14, 30), 180), true); // 2:30–5:30, touches the buffer
  assert.equal(isOpenSpan(a, s, wed(15), 180), false); // 3–6pm runs into the buffer
  assert.equal(isOpenSpan(a, s, wed(14, 15), 60), false); // off the 30-min grid
  assert.equal(isOpenSpan(a, s, wed(10), 300), false); // 5h isn't an allowed length
  assert.equal(isOpenSpan(a, s, wed(10), 360), true);
  assert.equal(isOpenSpan(a, s, new Date('2026-11-16T22:00:00Z'), 60), false); // today: inside 24h
  assert.equal(isOpenSpan(a, s, new Date('2027-02-01T22:00:00Z'), 60), false); // past the window
});

test('startOptions lists grid starts with the lengths that fit', () => {
  const a = computeAvailability(base({ bookings: [booking({ startsAt: WED_6PM, bandId: 99 })] }));
  const opts = startOptions(day(a, '2026-11-18').free, base().settings);
  const fmt = opts.map((o) => `${chicagoTime(o.start)}:${o.lengths.map((l) => l / 60).join('/')}`);
  assert.equal(fmt[0], '10:00:1/2/3/4/6');
  assert.ok(fmt.includes('14:30:1/2/3'));
  assert.equal(fmt[fmt.length - 1], '16:30:1'); // last start where 1h fits before 5:30
  // A stretch that starts off the grid rounds up to the next grid point.
  const odd = startOptions([{ start: new Date('2026-11-18T16:10:00Z'), end: new Date('2026-11-18T18:00:00Z') }], base().settings);
  assert.deepEqual(odd.map((o) => chicagoTime(o.start)), ['10:30', '11:00']);
});

test('DST: windows and the grid follow Chicago wall time across the change', () => {
  const now = new Date('2027-03-01T15:00:00Z');
  const a = computeAvailability(base({ now }));
  assert.equal(day(a, '2027-03-08').window?.start.toISOString(), '2027-03-08T16:00:00.000Z'); // CST
  assert.equal(day(a, '2027-03-15').window?.start.toISOString(), '2027-03-15T15:00:00.000Z'); // CDT
  assert.equal(free(a, '2027-03-14'), '10:00–22:00'); // spring-forward day
  const opts = startOptions(day(a, '2027-03-15').free, base().settings);
  assert.equal(chicagoTime(opts[0].start), '10:00');
});

test('subtract handles edges and containment', () => {
  const iv = (a: number, b: number) => ({ start: new Date(a), end: new Date(b) });
  assert.deepEqual(subtract(iv(0, 10), [iv(2, 4), iv(6, 8)]), [iv(0, 2), iv(4, 6), iv(8, 10)]);
  assert.deepEqual(subtract(iv(0, 10), [iv(-5, 20)]), []);
  assert.deepEqual(subtract(iv(0, 10), [iv(10, 12)]), [iv(0, 10)]);
});

test('findConflicts flags confirmed upcoming bookings a new constraint lands on', () => {
  const settings = base().settings;
  const bookings: EngineBooking[] = [
    booking({ id: 1, startsAt: WED_6PM, status: 'confirmed' }),
    booking({ id: 2, startsAt: new Date('2026-11-21T18:00:00Z'), status: 'pending' }), // pending: not a conflict
    booking({ id: 3, startsAt: new Date('2026-11-10T00:00:00Z'), status: 'confirmed' }), // past
    booking({ id: 4, startsAt: new Date('2026-11-24T00:00:00Z'), status: 'confirmed' }), // clear
    booking({ id: 5, startsAt: new Date('2026-11-21T16:00:00Z'), status: 'confirmed' }), // Sat 10am–1pm, show from 4pm: clear
  ];
  const conflicts = findConflicts(
    bookings,
    {
      settings,
      showDates: ['2026-11-18', '2026-11-21', '2026-11-09'],
      unavailableDays: [],
      blackouts: [],
      busy: [{ start: new Date('2026-11-19T02:00:00Z'), end: new Date('2026-11-19T02:30:00Z') }],
    },
    NOW,
  );
  assert.deepEqual(conflicts, [{ bookingId: 1, reasons: ['show', 'busy'] }]);
});

test('chicagoDate uses Chicago, not UTC', () => {
  assert.equal(chicagoDate(new Date('2026-11-19T04:00:00Z')), '2026-11-18'); // 10pm Wed
});
