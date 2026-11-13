import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLead } from './lead-rules.ts';

const ok = {
  name: ' Tess Rivera ',
  project: 'The Cowbells',
  email: 'tess@example.com',
  phone: '',
  people: '4',
  genreLinks: 'garage pop · bandcamp.com/cowbells',
  frequency: 'weekly',
  preferredTimes: 'weeknights after 6',
  notes: '',
};

test('a good lead is trimmed and typed', () => {
  const r = parseLead(ok);
  assert.ok(r.ok && 'value' in r);
  assert.equal(r.value.name, 'Tess Rivera');
  assert.equal(r.value.people, 4);
  assert.equal(r.value.frequency, 'weekly');
});

test('people and phone are optional', () => {
  const r = parseLead({ ...ok, people: '', phone: undefined });
  assert.ok(r.ok && 'value' in r && r.value.people === null && r.value.phone === '');
});

test('the honeypot marks spam without an error', () => {
  assert.deepEqual(parseLead({ ...ok, website: 'http://spam.example' }), { ok: true, spam: true });
});

test('required fields and limits', () => {
  const field = (body: unknown) => {
    const r = parseLead(body);
    return r.ok ? null : r.field;
  };
  assert.equal(field({ ...ok, name: '  ' }), 'name');
  assert.equal(field({ ...ok, email: 'nope' }), 'email');
  assert.equal(field({ ...ok, frequency: 'daily' }), 'frequency');
  assert.equal(field({ ...ok, people: '0' }), 'people');
  assert.equal(field({ ...ok, people: '2.5' }), 'people');
  assert.equal(field({ ...ok, notes: 'x'.repeat(5001) }), 'notes');
});
