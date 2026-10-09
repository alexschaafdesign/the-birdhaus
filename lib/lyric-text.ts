// Client-safe lyric text conventions for the lyrics desk. Everything lives in
// the plain text itself — nothing extra is stored:
//   [verse 1], [chorus]   a line that's only a bracketed tag is a section head
//   ???  or  ~            a hole: placeholder words still to be written
//   ! at line start       the line is flagged as needing work
//   ==some words==        a highlighted phrase that needs work
//   // a note             end-of-line note to self (not counted as lyrics)
// Syllable counts are a heuristic (English spelling rules, no dictionary) —
// good enough to compare a line against its neighbours, not to be trusted
// on proper nouns.

export type LyricLineKind = 'blank' | 'section' | 'line';

// Pieces of one line for the editor's highlight backdrop. Concatenating the
// texts gives back the original line exactly — the backdrop depends on it.
export type LyricSegmentKind = 'plain' | 'flag' | 'hole' | 'mark' | 'highlight' | 'note';

export interface LyricSegment {
  kind: LyricSegmentKind;
  text: string;
}

export interface LyricLine {
  text: string;
  kind: LyricLineKind;
  hasHole: boolean;
  flagged: boolean;
  highlighted: boolean;
  note: string | null;
  syllables: number;
  segments: LyricSegment[];
}

const SECTION_RE = /^\s*\[[^\]\n]+\]\s*$/;
const FLAG_RE = /^\s*!\s?/;
// A note starts at a // that opens the line or follows whitespace.
const NOTE_RE = /(^|\s)(\/\/.*)$/;
const HIGHLIGHT_SPLIT_RE = /(==[^=\n]+?==)/;
const HOLE_SPLIT_RE = /(\?{3,}|~+)/;
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

function splitHoles(text: string, base: 'plain' | 'highlight'): LyricSegment[] {
  return text
    .split(HOLE_SPLIT_RE)
    .map((part, i): LyricSegment => ({ kind: i % 2 === 1 ? 'hole' : base, text: part }))
    .filter((s) => s.text !== '');
}

export function parseLyricLine(text: string): LyricLine {
  const empty = { hasHole: false, flagged: false, highlighted: false, note: null, syllables: 0 };
  if (!text.trim()) return { text, kind: 'blank', ...empty, segments: [{ kind: 'plain', text }] };
  if (SECTION_RE.test(text)) {
    return { text, kind: 'section', ...empty, segments: [{ kind: 'plain', text }] };
  }

  const segments: LyricSegment[] = [];
  let rest = text;
  const flag = rest.match(FLAG_RE);
  if (flag) {
    segments.push({ kind: 'flag', text: flag[0] });
    rest = rest.slice(flag[0].length);
  }
  let note: string | null = null;
  let noteText = '';
  const noteMatch = rest.match(NOTE_RE);
  if (noteMatch && noteMatch.index !== undefined) {
    const at = noteMatch.index + noteMatch[1].length;
    noteText = rest.slice(at);
    note = noteText.replace(/^\/\/\s*/, '').trim() || null;
    rest = rest.slice(0, at);
  }

  let highlighted = false;
  rest.split(HIGHLIGHT_SPLIT_RE).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      highlighted = true;
      segments.push({ kind: 'mark', text: '==' });
      segments.push(...splitHoles(part.slice(2, -2), 'highlight'));
      segments.push({ kind: 'mark', text: '==' });
    } else {
      segments.push(...splitHoles(part, 'plain'));
    }
  });
  if (noteText) segments.push({ kind: 'note', text: noteText });

  const words = rest.replace(/==/g, '');
  return {
    text,
    kind: 'line',
    hasHole: HOLE_TEST_RE.test(words),
    flagged: Boolean(flag),
    highlighted,
    note,
    syllables: syllablesInLine(words),
    segments,
  };
}

export function parseLyrics(body: string): LyricLine[] {
  return body.split('\n').map(parseLyricLine);
}

export interface LyricStats {
  lines: number;
  words: number;
  holes: number;
  // Lines flagged with ! or carrying a ==highlight==.
  flags: number;
}

export function lyricStats(body: string | null): LyricStats {
  // A note-only line (// …) isn't a lyric line.
  const lines = parseLyrics(body ?? '').filter((l) => l.kind === 'line' && cleanLine(l).trim());
  return {
    lines: lines.length,
    words: lines.reduce(
      (n, l) =>
        n +
        cleanLine(l)
          .replace(/\?{3,}|~+/g, ' ')
          .split(/\s+/)
          .filter(Boolean).length,
      0
    ),
    holes: lines.filter((l) => l.hasHole).length,
    flags: lines.filter((l) => l.flagged || l.highlighted).length,
  };
}

function cleanLine(l: LyricLine): string {
  return l.segments
    .filter((s) => s.kind !== 'flag' && s.kind !== 'mark' && s.kind !== 'note')
    .map((s) => s.text)
    .join('')
    .trimEnd();
}

// The words without the desk's working marks (flags, highlights, notes) —
// for copying lyrics out. Holes stay: they're still missing words.
export function cleanLyrics(body: string): string {
  return parseLyrics(body)
    .map((l) => (l.kind === 'line' ? cleanLine(l) : l.text))
    .join('\n');
}

// Toggle the ! flag on lines [from, to] (inclusive, 0-based). If every
// flaggable line in range is flagged, unflag them all; otherwise flag the
// rest. Section heads and blank lines are left alone.
export function toggleFlags(body: string, from: number, to: number): string {
  const lines = body.split('\n');
  const range = lines
    .map((text, i) => ({ text, i }))
    .filter(({ i }) => i >= from && i <= to)
    .filter(({ text }) => parseLyricLine(text).kind === 'line');
  if (range.length === 0) return body;
  const allFlagged = range.every(({ text }) => FLAG_RE.test(text));
  for (const { text, i } of range) {
    if (allFlagged) lines[i] = text.replace(FLAG_RE, '');
    else if (!FLAG_RE.test(text)) lines[i] = `! ${text}`;
  }
  return lines.join('\n');
}

// The lyrics desk keys the workspace scratch pad as song 0 (song ids start at
// 1). Lives here, not in the client component, so the server page can use it.
export const SCRATCH_ID = 0;
