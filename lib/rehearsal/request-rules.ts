// Request and cancellation rules for the band booking page. PURE (no DB) so
// they run under `npm test`; lib/rehearsal/requests.ts does the writes.

import type { SeriesRule } from './series.ts';
import { MAX_OCCURRENCES, occurrenceStarts } from './series.ts';

export type PaymentMethod = 'venmo' | 'square' | 'cash';

// A request is a list of items: a single block, or a block that repeats.
export const MAX_ITEMS_PER_REQUEST = 12;
export const MAX_SESSIONS_PER_REQUEST = 60;
const MAX_NOTE = 2000;
const MAX_GEAR_NOTES = 500;

export interface RequestRulesSettings {
  gearOptions: string[];
  squareEnabled: boolean;
  cashEnabled: boolean;
}

export interface RequestItem {
  start: Date; // the block picked; a repeat's first session
  repeat: SeriesRule | null;
}

export interface ParsedRequest {
  items: RequestItem[];
  note: string;
  gearNeeded: string[];
  gearNotes: string;
  paymentMethod: PaymentMethod;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// The payment methods a band may pick right now. Venmo always; card and cash
// once switched on in Settings (Phases 6b/6c).
export function paymentMethodsOffered(s: Pick<RequestRulesSettings, 'squareEnabled' | 'cashEnabled'>): PaymentMethod[] {
  return ['venmo', ...(s.squareEnabled ? (['square'] as const) : []), ...(s.cashEnabled ? (['cash'] as const) : [])];
}

function parseRepeat(raw: unknown, start: Date): Result<SeriesRule | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const r = raw as Record<string, unknown>;
  if (r.freq !== 'weekly' && r.freq !== 'biweekly' && r.freq !== 'monthly_nth') {
    return { ok: false, error: 'Pick how often to repeat.' };
  }
  const hasUntil = typeof r.until === 'string' && r.until !== '';
  const hasCount = r.count !== undefined && r.count !== null && r.count !== '';
  if (hasUntil === hasCount) return { ok: false, error: 'Say when the repeat ends: a date or a number of sessions.' };
  if (hasUntil) {
    const until = r.until as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until))) {
      return { ok: false, error: 'That end date isn’t valid.' };
    }
    if (new Date(`${until}T23:59:59Z`).getTime() < start.getTime()) {
      return { ok: false, error: 'The end date is before the first session.' };
    }
    return { ok: true, value: { freq: r.freq, until } };
  }
  const count = Number(r.count);
  if (!Number.isInteger(count) || count < 2 || count > MAX_OCCURRENCES) {
    return { ok: false, error: `Repeat between 2 and ${MAX_OCCURRENCES} sessions.` };
  }
  return { ok: true, value: { freq: r.freq, count } };
}

// Shape-checks a request body: { items: [{ start, repeat? }], note, gearNeeded,
// gearNotes, paymentMethod }. Whether blocks are open is checked separately
// (planRequest against a fresh availability computation).
export function parseRequestBody(body: unknown, s: RequestRulesSettings): Result<ParsedRequest> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Something went wrong — reload and try again.' };
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.items) || b.items.length === 0) return { ok: false, error: 'Pick at least one open block.' };
  if (b.items.length > MAX_ITEMS_PER_REQUEST) {
    return { ok: false, error: `That's a lot — send at most ${MAX_ITEMS_PER_REQUEST} picks at a time.` };
  }
  const items: RequestItem[] = [];
  const seen = new Set<number>();
  for (const raw of b.items as unknown[]) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const d = typeof it.start === 'string' ? new Date(it.start) : null;
    if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'One of those blocks isn’t valid — reload and try again.' };
    if (seen.has(d.getTime())) continue;
    seen.add(d.getTime());
    const repeat = parseRepeat(it.repeat, d);
    if (!repeat.ok) return repeat;
    items.push({ start: d, repeat: repeat.value });
  }
  items.sort((x, y) => x.start.getTime() - y.start.getTime());

  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > MAX_NOTE) return { ok: false, error: `Your note is too long (max ${MAX_NOTE} characters).` };

  const byKey = new Map(s.gearOptions.map((o) => [o.toLowerCase(), o]));
  const gearNeeded: string[] = [];
  const pickedGear = b.gearNeeded ?? [];
  if (!Array.isArray(pickedGear)) return { ok: false, error: 'Gear needed must be a list.' };
  for (const item of pickedGear) {
    const label = typeof item === 'string' ? byKey.get(item.trim().toLowerCase()) : undefined;
    if (!label) return { ok: false, error: 'That gear option isn’t on the list any more — reload and try again.' };
    if (!gearNeeded.includes(label)) gearNeeded.push(label);
  }
  const gearNotes = typeof b.gearNotes === 'string' ? b.gearNotes.trim() : '';
  if (gearNotes.length > MAX_GEAR_NOTES) {
    return { ok: false, error: `Gear notes are too long (max ${MAX_GEAR_NOTES} characters).` };
  }

  const method = b.paymentMethod ?? 'venmo';
  if (typeof method !== 'string' || !paymentMethodsOffered(s).includes(method as PaymentMethod)) {
    return { ok: false, error: 'Pick a payment method.' };
  }

  return { ok: true, value: { items, note, gearNeeded, gearNotes, paymentMethod: method as PaymentMethod } };
}

// --- planning: items -> sessions --------------------------------------------

export interface PlannedSession {
  start: Date;
  item: number; // index into items
  repeat: boolean;
}

export interface Plan {
  sessions: PlannedSession[];
  skipped: Array<{ start: Date; item: number; why: 'unavailable' | 'too_far' }>;
  closed: number[]; // items whose own block isn't open (refused)
}

// Expands items into the sessions to book. A single block, or a repeat's first
// session, must be open; a repeat's later dates are booked when open and
// otherwise skipped (unavailable, or past the booking window). A date two items
// share is booked once. PURE: the booking page previews with it, the server
// books with it, so the band's total matches.
export function planRequest(items: RequestItem[], isOpen: (start: Date) => boolean, windowEnd: Date): Plan {
  const plan: Plan = { sessions: [], skipped: [], closed: [] };
  const claimed = new Set<number>();
  items.forEach((it, i) => {
    if (!isOpen(it.start)) {
      plan.closed.push(i);
      return;
    }
    const starts = it.repeat ? occurrenceStarts(it.start, it.repeat) : [it.start];
    for (const s of starts) {
      if (claimed.has(s.getTime())) continue;
      if (isOpen(s)) {
        claimed.add(s.getTime());
        plan.sessions.push({ start: s, item: i, repeat: Boolean(it.repeat) });
      } else {
        plan.skipped.push({ start: s, item: i, why: s.getTime() >= windowEnd.getTime() ? 'too_far' : 'unavailable' });
      }
    }
  });
  plan.sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
  return plan;
}

// A band can cancel its own pending or confirmed booking until
// cancel_cutoff_hours before it starts. After that the page says to contact Alex.
export function canBandCancel(
  b: { status: string; startsAt: Date },
  now: Date,
  cancelCutoffHours: number,
): boolean {
  if (b.status !== 'pending' && b.status !== 'confirmed') return false;
  return b.startsAt.getTime() - now.getTime() >= cancelCutoffHours * 3_600_000;
}
