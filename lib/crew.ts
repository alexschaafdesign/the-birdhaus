// Client-safe crew constants — no server-only imports (next/headers, sql), so
// both the admin UI (CrewList) and server code can import the focus-area
// registry without dragging the data layer into the browser bundle. Mirrors
// the pattern in lib/club-roles.ts.
//
// A "focus area" is a job a crew member is responsible for. Each key maps to a
// widget rendered on their tailored /admin home (see components/admin/CrewHome).
// The user's free-text `title` is just a label; THESE keys are what actually
// decide what shows up for them.

export type FocusAreaKey = 'sound_coverage';

export interface FocusArea {
  key: FocusAreaKey;
  // Shown next to the checkbox in the crew admin form.
  label: string;
  // One-line explanation of the responsibility.
  description: string;
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    key: 'sound_coverage',
    label: 'Sound engineer coverage',
    description: 'Make sure every upcoming show has a confirmed sound engineer.',
  },
];

export const ALL_FOCUS_KEYS: FocusAreaKey[] = FOCUS_AREAS.map((f) => f.key);

export function isFocusAreaKey(value: unknown): value is FocusAreaKey {
  return typeof value === 'string' && ALL_FOCUS_KEYS.includes(value as FocusAreaKey);
}

// Keeps only known focus keys, de-duplicated. Unknown/removed keys are dropped
// so a renamed registry never leaves a dangling assignment.
export function sanitizeFocusAreas(input: unknown): FocusAreaKey[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(isFocusAreaKey))];
}

export function getFocusArea(key: string): FocusArea | undefined {
  return FOCUS_AREAS.find((f) => f.key === key);
}
