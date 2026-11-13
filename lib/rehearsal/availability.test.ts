import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAvailability,
  findConflicts,
  forBand,
  isOpenBlock,
  chicagoDate,
  type EngineInput,
  type EngineBooking,
  type Block,
} from './availability.ts';

// Monday 2026-11-16, 9:00am Chicago (CST, UTC-6).
const NOW = new Date('2026-11-16T15:00:00Z');

function base(over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    settings: {
      blockMinutes: 180,
      windowMinHours: 24,
      windowMaxWeeks: 8,
      showDayRule: 'whole_day',
      showDayFrom: '15:00',
    },
    hours: [
      { weekday: 1, startTime: '18:00' }, // Mon
      { weekday: 3, startTime: '18:00' }, // Wed
      { weekday: 6, startTime: '12:00' }, // Sat
      { weekday: 6, startTime: '15:00' },
      { weekday: 6, startTime: '22:00' }, // runs past midnight into Sunday
    ],
    showDates: [],
    unavailableDays: [],
    blackouts: [],
    busy: { intervals: [], checked: true },
    bookings: [],
    ...over,
  };
}

function at(blocks: Block[], date: string, startTime: string): Block {
  const b = blocks.find((x) => x.date === date && x.startTime === startTime);
  assert.ok(b, `no block ${date} ${startTime}`);
  return b;
}

function booking(over: Partial<EngineBooking> & Pick<EngineBooking, 'startsAt'>): EngineBooking {
  return {
    id: 1,
    bandId: 10,
    status: 'pending',
    endsAt: new Date(over.startsAt.getTime() + 3 * 3_600_000),
    expiresAt: new Date('2026-11-20T00:00:00Z'),
    ...over,
  };
}

// Wed 2026-11-18 18:00 CST = 2026-11-19T00:00Z.
const WED_6PM = new Date('2026-11-19T00:00:00Z');

test('standing hours lay out as open blocks in Chicago time', () => {
  const { blocks } = computeAvailability(base());
  const wed = at(blocks, '2026-11-18', '18:00');
  assert.equal(wed.state, 'open');
  assert.equal(wed.start.toISOString(), '2026-11-19T00:00:00.000Z');
  assert.equal(wed.end.toISOString(), '2026-11-19T03:00:00.000Z');
  assert.deepEqual(wed.reasons, []);
  // Only standing weekdays appear.
  assert.ok(!blocks.some((b) => b.date === '2026-11-17'), 'no Tuesday blocks');
});

test('blocks inside 24h are unavailable (window); earlier today is past', () => {
  const { blocks } = computeAvailability(base());
  // Monday 6pm today is 9h away.
  assert.deepEqual(at(blocks, '2026-11-16', '18:00').reasons, ['window']);
  const later = computeAvailability(base({ now: new Date('2026-11-17T03:00:00Z') })); // Mon 9pm
  assert.deepEqual(at(later.blocks, '2026-11-16', '18:00').reasons, ['past']);
});

test('the window ends 8 weeks out', () => {
  const { blocks, windowEnd } = computeAvailability(base());
  assert.equal(windowEnd.toISOString(), '2027-01-11T15:00:00.000Z');
  // Mon 2027-01-11 18:00 is after 9am that day: outside.
  assert.deepEqual(at(blocks, '2027-01-11', '18:00').reasons, ['window']);
  assert.equal(at(blocks, '2027-01-09', '15:00').state, 'open');
  assert.ok(!blocks.some((b) => b.date > '2027-01-11'));
});

test('a show blocks its whole Chicago day by default', () => {
  const { blocks } = computeAvailability(base({ showDates: ['2026-11-21'] })); // Sat
  for (const t of ['12:00', '15:00', '22:00']) {
    assert.deepEqual(at(blocks, '2026-11-21', t).reasons, ['show']);
  }
  assert.equal(at(blocks, '2026-11-28', '12:00').state, 'open');
});

test('show_day_from blocks only from that time; a block ending at it stays open', () => {
  const settings = { ...base().settings, showDayRule: 'from_time' as const, showDayFrom: '15:00' };
  const { blocks } = computeAvailability(base({ settings, showDates: ['2026-11-21'] }));
  assert.equal(at(blocks, '2026-11-21', '12:00').state, 'open'); // 12–3pm
  assert.deepEqual(at(blocks, '2026-11-21', '15:00').reasons, ['show']);
});

test('a late block running past midnight into a show day is blocked', () => {
  const { blocks } = computeAvailability(base({ showDates: ['2026-11-22'] })); // Sun
  assert.deepEqual(at(blocks, '2026-11-21', '22:00').reasons, ['show']); // Sat 10pm–1am
  assert.equal(at(blocks, '2026-11-21', '15:00').state, 'open');
});

test('Booking "Not available" days black out the day', () => {
  const { blocks } = computeAvailability(base({ unavailableDays: ['2026-11-18'] }));
  assert.deepEqual(at(blocks, '2026-11-18', '18:00').reasons, ['unavailable_day']);
});

test('blackouts and busy times remove any block they overlap', () => {
  const { blocks } = computeAvailability(
    base({
      // Wed 7:30–8pm CST
      blackouts: [{ start: new Date('2026-11-19T01:30:00Z'), end: new Date('2026-11-19T02:00:00Z') }],
      // Sat 11am–12:30pm CST
      busy: {
        intervals: [{ start: new Date('2026-11-21T17:00:00Z'), end: new Date('2026-11-21T18:30:00Z') }],
        checked: true,
      },
    }),
  );
  assert.deepEqual(at(blocks, '2026-11-18', '18:00').reasons, ['blackout']);
  assert.deepEqual(at(blocks, '2026-11-21', '12:00').reasons, ['busy']);
  // Touching end-to-start is not an overlap.
  assert.equal(at(blocks, '2026-11-21', '15:00').state, 'open');
});

test("a failed calendar check leaves blocks open and says so", () => {
  const a = computeAvailability(base({ busy: { intervals: [], checked: false } }));
  assert.equal(a.calendarChecked, false);
  assert.equal(at(a.blocks, '2026-11-18', '18:00').state, 'open');
});

test('pending and confirmed bookings hold their block; expired, declined and cancelled do not', () => {
  const sat = (t: string) => new Date(`2026-11-21T${t}:00Z`);
  const bookings: EngineBooking[] = [
    booking({ id: 1, startsAt: WED_6PM, status: 'pending' }),
    booking({ id: 2, startsAt: sat('18:00'), status: 'confirmed' }), // Sat 12pm CST
    booking({ id: 3, startsAt: sat('21:00'), status: 'pending', expiresAt: new Date('2026-11-16T14:59:00Z') }), // expired a minute ago
    booking({ id: 4, startsAt: new Date('2026-11-24T00:00:00Z'), status: 'declined' }), // Mon 23rd 6pm
    booking({ id: 5, startsAt: new Date('2026-11-26T00:00:00Z'), status: 'cancelled' }), // Wed 25th 6pm
  ];
  const { blocks } = computeAvailability(base({ bookings }));
  assert.deepEqual(at(blocks, '2026-11-18', '18:00').reasons, ['booked']);
  assert.deepEqual(at(blocks, '2026-11-21', '12:00').reasons, ['booked']);
  assert.equal(at(blocks, '2026-11-21', '15:00').state, 'open', 'expired pending frees the block on read');
  assert.equal(at(blocks, '2026-11-23', '18:00').state, 'open');
  assert.equal(at(blocks, '2026-11-25', '18:00').state, 'open');
});

test("the viewer sees their own bookings as requested/confirmed; others' as unavailable", () => {
  const bookings: EngineBooking[] = [
    booking({ id: 1, bandId: 10, startsAt: WED_6PM, status: 'pending' }),
    booking({ id: 2, bandId: 10, startsAt: new Date('2026-11-21T18:00:00Z'), status: 'confirmed' }),
    booking({ id: 3, bandId: 99, startsAt: new Date('2026-11-21T21:00:00Z'), status: 'confirmed' }),
  ];
  const { blocks } = computeAvailability(base({ bookings, viewerBandId: 10 }));
  assert.equal(at(blocks, '2026-11-18', '18:00').state, 'requested');
  assert.equal(at(blocks, '2026-11-18', '18:00').bookingId, 1);
  assert.equal(at(blocks, '2026-11-21', '12:00').state, 'confirmed');
  const other = at(blocks, '2026-11-21', '15:00');
  assert.equal(other.state, 'unavailable');
  assert.equal(other.bookingId, undefined);
});

test("the band's view never says why a block is unavailable", () => {
  const a = computeAvailability(
    base({ showDates: ['2026-11-21'], bookings: [booking({ bandId: 99, startsAt: WED_6PM })], viewerBandId: 10 }),
  );
  const band = forBand(a);
  for (const b of band.blocks) assert.ok(!('reasons' in b));
  assert.ok(!('calendarChecked' in band));
  assert.equal(band.blocks.find((b) => b.date === '2026-11-21')?.state, 'unavailable');
});

test('own bookings that no longer match a standing block still show', () => {
  // Booked Thursday 7pm, which isn't a standing block (hours changed later).
  const thu = booking({ id: 7, startsAt: new Date('2026-11-20T01:00:00Z'), status: 'confirmed' });
  const { blocks } = computeAvailability(base({ bookings: [thu], viewerBandId: 10 }));
  const b = at(blocks, '2026-11-19', '19:00');
  assert.equal(b.state, 'confirmed');
  assert.equal(b.bookingId, 7);
  // Still sorted by start.
  for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i - 1].start <= blocks[i].start);
});

test('duplicate standing hours produce one block', () => {
  const hours = [...base().hours, { weekday: 3, startTime: '18:00' }];
  const { blocks } = computeAvailability(base({ hours }));
  assert.equal(blocks.filter((b) => b.date === '2026-11-18').length, 1);
});

test('fromDate lays out earlier days as unavailable so a week view has no holes', () => {
  const { blocks } = computeAvailability(base({ fromDate: '2026-11-14' })); // Sat before now
  assert.deepEqual(at(blocks, '2026-11-14', '12:00').reasons, ['past']);
});

test('DST: 6pm stays 6pm Chicago across the change, and a non-existent start is skipped', () => {
  const now = new Date('2027-03-01T15:00:00Z');
  const hours = [
    { weekday: 1, startTime: '18:00' },
    { weekday: 0, startTime: '02:30' }, // doesn't exist on 2027-03-14 (spring forward)
  ];
  const { blocks } = computeAvailability(base({ now, hours }));
  assert.equal(at(blocks, '2027-03-08', '18:00').start.toISOString(), '2027-03-09T00:00:00.000Z'); // CST
  assert.equal(at(blocks, '2027-03-15', '18:00').start.toISOString(), '2027-03-15T23:00:00.000Z'); // CDT
  assert.ok(!blocks.some((b) => b.date === '2027-03-14'), 'no 2:30am block on the spring-forward day');
  assert.ok(blocks.some((b) => b.date === '2027-03-21' && b.startTime === '02:30'));
  // Blocks are always block_minutes of real time.
  for (const b of blocks) assert.equal(b.end.getTime() - b.start.getTime(), 180 * 60_000);
});

test('isOpenBlock checks one exact block', () => {
  const a = computeAvailability(base({ showDates: ['2026-11-21'] }));
  assert.equal(isOpenBlock(a, WED_6PM), true);
  assert.equal(isOpenBlock(a, new Date('2026-11-21T18:00:00Z')), false); // show day
  assert.equal(isOpenBlock(a, new Date('2026-11-19T00:30:00Z')), false); // not a block start
});

test('findConflicts flags confirmed upcoming bookings a new constraint lands on', () => {
  const settings = base().settings;
  const bookings: EngineBooking[] = [
    booking({ id: 1, startsAt: WED_6PM, status: 'confirmed' }),
    booking({ id: 2, startsAt: new Date('2026-11-21T18:00:00Z'), status: 'pending' }), // pending: not a conflict
    booking({ id: 3, startsAt: new Date('2026-11-10T00:00:00Z'), status: 'confirmed' }), // past
    booking({ id: 4, startsAt: new Date('2026-11-24T00:00:00Z'), status: 'confirmed' }), // clear
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
