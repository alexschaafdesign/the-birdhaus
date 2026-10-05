import { SAMPLE_NIGHTS } from './fixtures';
import { getLiveNights } from './live';
import type { ArchiveSet, Night, SeriesFilter } from './types';

export type * from './types';

// Every archive night, newest first. `sample` swaps in the ?sample fixtures.
export async function getNights(sample: boolean): Promise<Night[]> {
  const nights = sample ? SAMPLE_NIGHTS : await getLiveNights();
  return [...nights].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function seriesOf(night: Night): SeriesFilter {
  if (night.kind === 'sc') return 'sc';
  return night.freshCuts != null ? 'fc' : 'bh';
}

// The SeriesTick colour for a night: one tick per ID.
export function tickOf(night: Night): 'bh' | 'fc' | 'song-club' {
  const s = seriesOf(night);
  return s === 'sc' ? 'song-club' : s;
}

// "FC 010" for Fresh Cuts nights, else null.
export function seriesTag(night: Night): string | null {
  return night.freshCuts != null ? `FC ${String(night.freshCuts).padStart(3, '0')}` : null;
}

export function lineup(night: Night): string {
  return night.sets.map((s) => s.band).join(' · ') || night.title || '';
}

// Totals for the header: distinct bands (case-insensitive) and sets played.
export function archiveTotals(nights: Night[]): { bands: number; sets: number } {
  return {
    bands: new Set(nights.flatMap((n) => n.sets.map((s) => s.band.toLowerCase()))).size,
    sets: nights.reduce((sum, n) => sum + n.sets.length, 0),
  };
}

export function photoCount(night: Night): number {
  return (
    (night.media.photos?.length ?? 0) +
    night.sets.reduce((sum, s) => sum + (s.media.photos?.length ?? 0), 0)
  );
}

function hasVideo(night: Night): boolean {
  return !!night.media.videos?.length || night.sets.some((s) => s.media.video);
}

function hasAudio(night: Night): boolean {
  return !!night.media.audio?.length || night.sets.some((s) => s.media.audio);
}

function hasPhotos(night: Night): boolean {
  return photoCount(night) > 0 || !!night.media.photoFolder;
}

// The index's quiet "what exists" column: "3 sets · video · photos".
export function nightSummary(night: Night): string {
  const parts: string[] = [];
  if (night.sets.length) parts.push(`${night.sets.length} ${night.sets.length === 1 ? 'set' : 'sets'}`);
  if (hasVideo(night)) parts.push('video');
  if (hasAudio(night)) parts.push('audio');
  if (hasPhotos(night)) parts.push('photos');
  if (night.sets.some((s) => s.notes)) parts.push('notes');
  if (parts.length === 0 && night.kind === 'sc') parts.push('song club');
  return parts.join(' · ');
}

// What a single set carries, for its one-line collapsed form: "photos only",
// "video · notes", or null when it has nothing of its own.
export function setSummary(set: ArchiveSet): string | null {
  const { video, audio, photos } = set.media;
  const parts = [
    video && 'video',
    audio && 'audio',
    photos?.length && 'photos',
    set.notes && 'notes',
    set.releases?.length && 'release',
  ].filter((p): p is string => !!p);
  if (parts.length === 0) return null;
  return parts.length === 1 ? `${parts[0]} only` : parts.join(' · ');
}

export function hasSetMedia(set: ArchiveSet): boolean {
  return setSummary(set) !== null;
}

// The night that renders open: the first set (running order) with video.
export function openSetSlug(night: Night): string | null {
  return night.sets.find((s) => s.media.video)?.slug ?? null;
}

// Older / newer neighbours in the newest-first list.
export function neighbours(nights: Night[], id: string): { prev: Night | null; next: Night | null } {
  const i = nights.findIndex((n) => n.id === id);
  if (i === -1) return { prev: null, next: null };
  return { prev: nights[i + 1] ?? null, next: nights[i - 1] ?? null };
}

// The newest sets that have video, newest night first, running order within.
export function latestRecordings(nights: Night[], count: number): Array<{ night: Night; set: ArchiveSet }> {
  return nights
    .flatMap((night) =>
      [...night.sets].reverse().filter((s) => s.media.video).map((set) => ({ night, set }))
    )
    .slice(0, count);
}

// A band's other Birdhaus sets (newest first), matched on slug, else name.
export function otherSets(nights: Night[], night: Night, set: ArchiveSet): Array<{ night: Night; set: ArchiveSet }> {
  const same = (s: ArchiveSet) =>
    set.bandSlug ? s.bandSlug === set.bandSlug : s.band.toLowerCase() === set.band.toLowerCase();
  return nights
    .filter((n) => n.id !== night.id)
    .flatMap((n) => n.sets.filter(same).map((s) => ({ night: n, set: s })));
}

// Group nights by month, keeping newest-first order. Key is "YYYY-MM".
export function byMonth(nights: Night[]): Array<{ key: string; nights: Night[] }> {
  const groups: Array<{ key: string; nights: Night[] }> = [];
  for (const night of nights) {
    const key = night.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.nights.push(night);
    else groups.push({ key, nights: [night] });
  }
  return groups;
}

// ---- formatting (positional, never TZ-dependent, like lib/catalogue) ----

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "SEP 2026" for a "YYYY-MM" key.
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// The ledger date: "FRI 4 SEP", or a range "SEP 16 – SEP 25".
export function ledgerDate(night: Night): string {
  const [y, m, d] = night.date.split('-').map(Number);
  if (night.endDate) {
    const [, m2, d2] = night.endDate.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d} – ${MONTHS[m2 - 1]} ${d2}`;
  }
  const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}

// "00:31:12" timecode.
export function timecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// Carry ?sample through links so the fixture set stays self-contained.
export function archiveHref(path: string, sample: boolean): string {
  if (!sample) return path;
  const [base, hash] = path.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}sample${hash ? `#${hash}` : ''}`;
}
