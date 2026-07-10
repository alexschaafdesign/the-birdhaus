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
