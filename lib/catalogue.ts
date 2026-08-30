// Broadcast-identity formatting helpers for the /redesign homepage.
//
// Catalogue IDs are NOT stored on shows — they're derived from the show date
// (BH-YYMMDD), matching the Rev. B scheme in the Figma catalogue index. A night
// in the Fresh Cuts series carries an FC tag alongside its BH id, never merged:
// "BH-260725 · FC 010".

import type { Show } from './shows';

// "2026-07-25" -> "BH-260725". Treats the date string positionally so it never
// depends on Date parsing / timezone (show.date is always "YYYY-MM-DD").
export function catalogueId(date: string): string {
  const [y, m, d] = date.split('-');
  return `BH-${y.slice(2)}${m}${d}`;
}

// Fresh Cuts installments carry "fresh-cuts" in the slug and a version number
// (…-fresh-cuts-v10). Same detection the existing /fresh-cuts route uses.
export function isFreshCuts(slug: string): boolean {
  return slug.toLowerCase().includes('fresh-cuts');
}

// "…-fresh-cuts-v10" -> "FC 010". Returns null for non-series shows.
export function freshCutsTag(slug: string): string | null {
  const match = slug.toLowerCase().match(/fresh-cuts-v(\d+)/);
  if (!match) return null;
  return `FC ${match[1].padStart(3, '0')}`;
}

// The full catalogue field for a show: the BH id, plus the series tag when it's
// a Fresh Cuts night. "BH-260725 · FC 010" or just "BH-260815".
export function fullCatalogue(show: Show): string {
  const id = catalogueId(show.date);
  const tag = freshCutsTag(show.slug);
  return tag ? `${id} · ${tag}` : id;
}

// "SAT 15 AUG 2026" — the header-band date style. Built positionally from the
// date parts so it prints the show's own calendar day regardless of viewer TZ.
export function broadcastDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const month = dt.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${String(d).padStart(2, '0')} ${month} ${y}`.toUpperCase();
}

// Short readout date for the compact schedule rows: "15 AUG".
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' });
  return `${String(d).padStart(2, '0')} ${month}`.toUpperCase();
}

// "7:30pm" / "7pm" / "8:00 PM" -> "19:30" / "19:00" / "20:00". The posters read
// times in 24-hour equipment style; source data is entered in 12-hour. Returns
// the input untouched if it doesn't parse, rather than throwing.
export function to24h(time: string | undefined): string | null {
  if (!time) return null;
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return time;
  let hour = Number(match[1]);
  const min = match[2] ?? '00';
  const ampm = match[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${min}`;
}

// The lineup band names as a plain string[] regardless of which shape the show
// carries (older string[] rows vs the joined {name} objects).
export function bandNames(show: Show): string[] {
  return show.bands.map((b) => (typeof b === 'string' ? b : b.name));
}
