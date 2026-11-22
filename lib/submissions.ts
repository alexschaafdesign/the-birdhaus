export type SubmissionStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'set_aside'
  | 'booked'
  | 'passed';

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'new',
  'contacted',
  'replied',
  'set_aside',
  'booked',
  'passed',
];

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  set_aside: 'Set aside',
  booked: 'Booked',
  passed: 'Passed',
};

// The 2027 admin (paper) shows a status as an ink label beside a small fill
// swatch from the DS spectrum (fill-only colours), plus the same colour as a
// card's left edge.
export const STATUS_SWATCH: Record<SubmissionStatus, { swatch: string; edge: string }> = {
  new: { swatch: 'border border-surface-ink bg-surface-paper', edge: 'border-l-surface-ink/30' },
  contacted: { swatch: 'bg-spectrum-violet', edge: 'border-l-spectrum-violet' },
  replied: { swatch: 'bg-spectrum-magenta', edge: 'border-l-spectrum-magenta' },
  set_aside: { swatch: 'bg-spectrum-amber', edge: 'border-l-spectrum-amber' },
  booked: { swatch: 'bg-surface-ink', edge: 'border-l-surface-ink' },
  passed: { swatch: 'bg-spectrum-red', edge: 'border-l-spectrum-red' },
};

export type SubmissionSource = 'form' | 'manual' | 'import';

// Show request form: putting their own bill together, or open to joining one.
export type BillPreference = 'building' | 'joining' | 'either';

export const BILL_PREFERENCES: BillPreference[] = ['building', 'joining', 'either'];

export const BILL_PREFERENCE_LABELS: Record<BillPreference, string> = {
  building: 'Could put a bill together',
  joining: 'Open to joining a bill',
  either: 'Building or joining',
};

export function parseBillPreference(input: unknown): BillPreference | null {
  return BILL_PREFERENCES.includes(input as BillPreference) ? (input as BillPreference) : null;
}

export type AvailabilityEntry =
  | { type: 'date'; value: string }
  | { type: 'range'; from: string; to: string };

// Every submissions column a query returns. Listed, never `*`: through Neon's
// pooler a `select *` keeps returning the old shape from a cached prepared
// statement after a migration adds a column, and fails ("cached plan must not
// change result type") — see CLAUDE.md. Use as ${sql(SUBMISSION_COLUMNS)}.
export const SUBMISSION_COLUMNS = [
  'id', 'band_name', 'contact_name', 'email', 'socials', 'genre', 'availability_text', 'comments',
  'notes', 'status', 'source', 'created_at', 'updated_at', 'availability', 'bill_preference',
];

export interface Submission {
  id: number;
  band_name: string;
  contact_name: string | null;
  email: string | null;
  socials: string | null;
  genre: string | null;
  availability_text: string | null;
  availability: AvailabilityEntry[];
  bill_preference: BillPreference | null;
  comments: string | null;
  notes: string | null;
  status: SubmissionStatus;
  source: SubmissionSource;
  created_at: string;
  updated_at: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isAvailabilityEntry(entry: unknown): entry is AvailabilityEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  if (e.type === 'date') {
    return typeof e.value === 'string' && ISO_DATE_RE.test(e.value);
  }
  if (e.type === 'range') {
    return (
      typeof e.from === 'string' &&
      typeof e.to === 'string' &&
      ISO_DATE_RE.test(e.from) &&
      ISO_DATE_RE.test(e.to) &&
      e.from <= e.to
    );
  }
  return false;
}

// Validates an incoming availability array from a request body. Returns null if invalid.
export function parseAvailability(input: unknown): AvailabilityEntry[] | null {
  if (!Array.isArray(input)) return null;
  return input.every(isAvailabilityEntry) ? (input as AvailabilityEntry[]) : null;
}

// True if `entry` includes any date in [filterFrom, filterTo] (inclusive, ISO strings).
export function availabilityEntryOverlaps(
  entry: AvailabilityEntry,
  filterFrom: string,
  filterTo: string
): boolean {
  if (entry.type === 'date') {
    return entry.value >= filterFrom && entry.value <= filterTo;
  }
  return entry.from <= filterTo && entry.to >= filterFrom;
}

// New Date("2026-08-01") parses as UTC midnight, which can shift a day backward
// once formatted in a timezone behind UTC — build the date from local parts instead.
function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Human-readable summary used to populate availability_text from structured entries,
// e.g. "Aug 1 – Sep 30, 2026, Oct 5, 2026".
export function formatAvailabilityEntries(entries: AvailabilityEntry[]): string {
  return entries
    .map((entry) =>
      entry.type === 'date'
        ? formatIsoDate(entry.value)
        : `${formatIsoDate(entry.from)} – ${formatIsoDate(entry.to)}`
    )
    .join(', ');
}
