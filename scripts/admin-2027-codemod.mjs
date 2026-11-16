#!/usr/bin/env node
// One-shot helper for the admin 2027 redesign: rewrites the old dark-shell
// Tailwind colours in the given files to the paper tokens, inverting the ground
// (cream text → ink, cream fills → ink, dark fills → paper) and dropping
// rounded corners. Only the mechanical part — every file still gets a hand
// pass afterwards (Panel/PageHeader/fields/StatusMark, error boxes, status
// pills). Prints what it couldn't map. Deleted in the redesign's last phase.
//
//   node scripts/admin-2027-codemod.mjs <file> [<file> …]

import { readFileSync, writeFileSync } from 'node:fs';

const C = '\\[#E8E0D0\\]'; // cream
const op = (s) => Number(s.replace(/[[\]]/g, '')) * (s.includes('.') ? 100 : 1);

// [regex, replacement | fn]. Order matters: specific before general.
const RULES = [
  // <option>s carried dark text for the browser's white dropdown; on paper
  // they inherit ink, so the class goes.
  [/(<option\b[^>]*?) className="text-\[#(?:171412|2A2420)\]"/g, '$1'],
  // Cream solids (buttons) → ink; the dark text on them → paper.
  [new RegExp(`(^|[\\s"'\`])(hover:)?bg-${C}(?=[\\s"'\`])`, 'g'), (_, a, h = '') => `${a}${h}bg-surface-ink`],
  [/(hover:)?text-\[#(?:2A2420|171412)\]/g, (_, h = '') => `${h}text-surface-paper`],
  [/hover:bg-white\b/g, 'hover:bg-accent-red'],
  // Cream washes → paper / paper-shade.
  [new RegExp(`bg-${C}/\\[0\\.0[0-9]+\\]`, 'g'), 'bg-surface-paper'],
  [new RegExp(`(hover:)?bg-${C}/(\\[?[0-9.]+\\]?)`, 'g'), (_, h = '') => `${h}bg-surface-paper-shade`],
  // Text.
  [new RegExp(`placeholder:text-${C}/[0-9]+`, 'g'), 'placeholder:text-surface-ink/45'],
  [new RegExp(`hover:text-${C}(/[0-9]+)?`, 'g'), 'hover:text-accent-red'],
  [new RegExp(`text-${C}/(\\[?[0-9.]+\\]?)`, 'g'), (_, o) => (op(o) >= 70 ? 'text-surface-ink/80' : 'text-surface-ink/60')],
  [new RegExp(`text-${C}`, 'g'), 'text-surface-ink'],
  // Borders and dividers.
  [new RegExp(`focus:border-${C}(/[0-9]+)?`, 'g'), 'focus:border-accent-red'],
  [new RegExp(`hover:border-${C}(/[0-9]+)?`, 'g'), 'hover:border-accent-red'],
  [new RegExp(`(border|divide)-${C}/(\\[?[0-9.]+\\]?)`, 'g'), (_, p, o) => (op(o) >= 20 ? `${p}-surface-ink` : `${p}-surface-ink/20`)],
  [new RegExp(`(border|divide)-${C}`, 'g'), (_, p) => `${p}-surface-ink`],
  [/accent-\[#c8a26a\]/g, 'accent-surface-ink'],
  // Reds → the DS red. (Error *boxes* get a hand pass: the DS rule is plain red text.)
  [/(hover:)?text-(?:red-[34]00|\[#F5A3A3\])(\/[0-9]+)?/g, (_, h = '') => `${h}text-accent-red`],
  [/(hover:)?border-(?:red-400|\[#F5A3A3\])(\/[0-9]+)?/g, (_, h = '') => `${h}border-accent-red`],
  [/bg-(?:red-400|\[#F5A3A3\])\/[0-9]+/g, ''],
  // Greens → ink (ok is ink + ✓ in StatusMark).
  [/text-(?:emerald-300|green-300|\[#bfe6c8\]|\[#7bb98a\])(\/[0-9]+)?/g, 'text-surface-ink'],
  [/border-(?:emerald-400|green-400|\[#7bb98a\])(\/[0-9]+)?/g, 'border-surface-ink'],
  [/bg-(?:emerald-400|green-400|\[#7bb98a\])\/[0-9]+/g, ''],
  // Type onto the DS scale (CommitMono only ships 400 and 700, so medium and
  // semibold would be synthesised: they become bold).
  [/(^|[\s"'`])((?:[a-z]+:)?)text-xs(?=[\s"'`])/g, '$1$2text-data-caption-13'],
  [/(^|[\s"'`])((?:[a-z]+:)?)text-sm(?=[\s"'`])/g, '$1$2text-body-3'],
  [/(^|[\s"'`])((?:[a-z]+:)?)text-base(?=[\s"'`])/g, '$1$2text-body-1'],
  [/(^|[\s"'`])((?:[a-z]+:)?)text-(?:lg|xl)(?=[\s"'`])/g, '$1$2text-header-4'],
  [/(^|[\s"'`])((?:[a-z]+:)?)text-2xl(?=[\s"'`])/g, '$1$2text-header-3'],
  [/(^|[\s"'`])font-(?:semibold|medium)(?=[\s"'`])/g, '$1font-bold'],
  // The dark shell ground, used for sticky bars and popovers → paper.
  [/(hover:|lg:)?bg-\[#(?:171412|1d1916|1b1712|1a1512)\]/g, (_, p = '') => `${p}bg-surface-paper`],
  // Yellow meant "draft / needs attention" → amber fill (fill-only on paper)
  // with ink text and edges; yellow rings and dots → accent-red.
  [/((?:[a-z]+:)*)bg-yellow-[0-9]{3}\/[0-9]+/g, '$1bg-spectrum-amber/40'],
  [/((?:[a-z]+:)*)bg-yellow-[0-9]{3}(?![\/0-9])/g, '$1bg-accent-red'],
  [/((?:[a-z]+:)*)ring-yellow-[0-9]{3}(\/[0-9]+)?/g, '$1ring-accent-red'],
  [/((?:[a-z]+:)*)text-yellow-[0-9]{3}(\/[0-9]+)?/g, '$1text-surface-ink'],
  [/((?:[a-z]+:)*)border-yellow-[0-9]{3}(\/[0-9]+)?/g, '$1border-surface-ink'],
  // Green-500s ("available", "booked") → ink.
  [/((?:[a-z]+:)*)text-green-[0-9]{3}(\/[0-9]+)?/g, '$1text-surface-ink'],
  [/((?:[a-z]+:)*)border-green-[0-9]{3}(\/[0-9]+)?/g, '$1border-surface-ink'],
  [/((?:[a-z]+:)*)bg-green-[0-9]{3}\/[0-9]+/g, '$1bg-surface-paper-shade'],
  [/((?:[a-z]+:)*)bg-green-[0-9]{3}(?![\/0-9])/g, '$1bg-surface-ink'],
  // The shell is CommitMono throughout; font-mono would swap in Plex Mono.
  [/(^|[\s"'`])font-mono(?=[\s"'`])/g, '$1'],
  // Sub-DS pixel sizes → the smallest DS label.
  [/(^|[\s"'`])((?:[a-z]+:)?)text-\[(?:9|10|11)px\](?=[\s"'`])/g, '$1$2text-data-label-10-small'],
  // Square corners.
  [/(^|[\s"'`])((?:[a-z-]+:)?rounded(?:-[a-z0-9]+)*)(?=[\s"'`])/g, '$1'],
  // No soft shadows in the DS (shadow-none stays: it resets a breakpoint).
  [/(^|[\s"'`])((?:[a-z-]+:)?shadow-(?:sm|md|lg|xl|2xl|inner))(?=[\s"'`])/g, '$1'],
];

// Any hex literal counts, inline style={{…}} colours included.
const LEFTOVER = /#[0-9A-Fa-f]{6}\b|\b(?:red|green|emerald|amber|yellow|sky|blue)-[0-9]{3}\b|\brounded\b/;

for (const file of process.argv.slice(2)) {
  let src = readFileSync(file, 'utf8');
  const before = src;
  for (const [re, rep] of RULES) src = src.replace(re, rep);
  // Doubled spaces left inside class strings are harmless; no whitespace
  // tidying here, since a broad regex could eat JSX {' '} spacers.
  if (src !== before) writeFileSync(file, src);
  src.split('\n').forEach((line, i) => {
    if (LEFTOVER.test(line)) console.log(`${file}:${i + 1}: ${line.trim()}`);
  });
}
