// Request and cancellation rules for the band booking page. PURE (no DB) so
// they run under `npm test`; lib/rehearsal/requests.ts does the writes.

export type PaymentMethod = 'venmo' | 'square' | 'cash';

export const MAX_BLOCKS_PER_REQUEST = 12;
const MAX_NOTE = 2000;
const MAX_GEAR_NOTES = 500;

export interface RequestRulesSettings {
  gearOptions: string[];
  squareEnabled: boolean;
  cashEnabled: boolean;
}

export interface ParsedRequest {
  starts: Date[];
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

// Shape-checks a request body. Whether each block is actually open is a
// separate check against a fresh availability computation.
export function parseRequestBody(body: unknown, s: RequestRulesSettings): Result<ParsedRequest> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Something went wrong — reload and try again.' };
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.starts) || b.starts.length === 0) return { ok: false, error: 'Pick at least one open block.' };
  if (b.starts.length > MAX_BLOCKS_PER_REQUEST) {
    return { ok: false, error: `That's a lot of blocks — send at most ${MAX_BLOCKS_PER_REQUEST} at a time.` };
  }
  const seen = new Set<number>();
  const starts: Date[] = [];
  for (const raw of b.starts) {
    const d = typeof raw === 'string' ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'One of those blocks isn’t valid — reload and try again.' };
    if (seen.has(d.getTime())) continue;
    seen.add(d.getTime());
    starts.push(d);
  }
  starts.sort((x, y) => x.getTime() - y.getTime());

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

  return { ok: true, value: { starts, note, gearNeeded, gearNotes, paymentMethod: method as PaymentMethod } };
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
