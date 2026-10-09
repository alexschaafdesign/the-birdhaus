// Client-safe lyric text conventions for the lyrics desk. Everything lives in
// the plain text itself — nothing extra is stored:
//   [verse 1], [chorus]   a line that's only a bracketed tag is a section head
//   ???  or  ~            a hole: placeholder words still to be written
// Syllable counts are a heuristic (English spelling rules, no dictionary) —
// good enough to compare a line against its neighbours, not to be trusted
// on proper nouns.

export type LyricLineKind = 'blank' | 'section' | 'line';

export interface LyricLine {
  text: string;
  kind: LyricLineKind;
  hasHole: boolean;
  syllables: number;
}

const SECTION_RE = /^\s*\[[^\]\n]+\]\s*$/;
// Split for highlighting: keeps the hole markers as their own parts.
export const HOLE_SPLIT_RE = /(\?{3,}|~+)/;
const HOLE_TEST_RE = /\?{3,}|~/;

export function syllablesInWord(raw: string): number {
  const word = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  const trimmed = word
    .replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m.slice(0, 1))
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 0);
}

export function syllablesInLine(text: string): number {
  return text
    .replace(/\?{3,}|~+/g, ' ')
    .split(/[\s\-–—/]+/)
    .reduce((n, w) => n + syllablesInWord(w), 0);
}

export function parseLyrics(body: string): LyricLine[] {
  return body.split('\n').map((text) => {
    if (!text.trim()) return { text, kind: 'blank', hasHole: false, syllables: 0 };
    if (SECTION_RE.test(text)) return { text, kind: 'section', hasHole: false, syllables: 0 };
    return {
      text,
      kind: 'line',
      hasHole: HOLE_TEST_RE.test(text),
      syllables: syllablesInLine(text),
    };
  });
}

export interface LyricStats {
  lines: number;
  words: number;
  holes: number;
}

export function lyricStats(body: string | null): LyricStats {
  const lines = parseLyrics(body ?? '').filter((l) => l.kind === 'line');
  return {
    lines: lines.length,
    words: lines.reduce(
      (n, l) => n + l.text.replace(/\?{3,}|~+/g, ' ').split(/\s+/).filter(Boolean).length,
      0
    ),
    holes: lines.filter((l) => l.hasHole).length,
  };
}
