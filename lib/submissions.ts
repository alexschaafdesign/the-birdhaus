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

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  new: '#E8E0D0',
  contacted: '#7FB3D5',
  replied: '#82C99A',
  set_aside: '#D9A94E',
  booked: '#6FCF97',
  passed: '#B0645A',
};

export type SubmissionSource = 'form' | 'manual' | 'import';

export type AvailabilityEntry =
  | { type: 'date'; value: string }
  | { type: 'range'; from: string; to: string };

export interface Submission {
  id: number;
  band_name: string;
  contact_name: string | null;
  email: string | null;
  socials: string | null;
  genre: string | null;
  availability_text: string | null;
  availability: AvailabilityEntry[];
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
