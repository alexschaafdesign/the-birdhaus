// Generates app/redesign/tokens.css from app/redesign/tokens.figma.json.
//
// The JSON is the committed source of truth, captured from the Figma
// "DESIGN SYSTEM - BIRDHAUS" published library via the Figma MCP. This script
// only transforms that snapshot into CSS — it does NOT talk to Figma (the
// Variables REST API is Enterprise-gated; this account is Pro). To refresh
// values: re-run the Figma enumeration, update the JSON, then `npm run tokens`.
//
// Two-tier structure (Tailwind v4):
//   @theme         — primitives: literal values, one per token
//   --bh-* raw     — only for tokens that vary across a mode axis; the
//                    indirection exists solely to carry the mode
//   @theme inline  — semantics: --color-* / --text-* resolve --bh-* at use site
//
// Axes compose and are independent:
//   [data-theme=dark]  flips mode-varying COLORS (Light default on :root)
//   [data-context=...] flips context-varying SIZES (Web default on :root)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'app/redesign/tokens.figma.json');
const OUT = join(root, 'app/redesign/tokens.css');

const data = JSON.parse(readFileSync(SRC, 'utf8'));

// Figma group separator `/` becomes a CSS-safe `-`.
const slug = (name) => name.replace(/\//g, '-');
// Size tokens drop the leading `size/` group: size/header-1 -> header-1.
const sizeSlug = (name) => slug(name.replace(/^size\//, ''));

const allEqual = (vals) => vals.every((v) => v === vals[0]);

const out = [];
const p = (s = '') => out.push(s);

// ---- header ---------------------------------------------------------------
p('/* ─────────────────────────────────────────────────────────────────────');
p('   Birdhaus design tokens — GENERATED FILE, DO NOT EDIT BY HAND.');
p('   Source: ' + data.source + ' (Figma published library)');
p('   Captured: ' + data.capturedAt + '   ·   Regenerate: `npm run tokens`');
p('   Edit values in app/redesign/tokens.figma.json, never here.');
p('   ───────────────────────────────────────────────────────────────────── */');
p();

// ---- @theme primitives ----------------------------------------------------
const modeInvariantColors = data.colors.variables.filter((v) =>
  allEqual(data.colors.modes.map((m) => v.values[m]))
);
const contextInvariantSizes = data.sizes.variables.filter((v) =>
  allEqual(data.sizes.modes.map((m) => v.values[m]))
);

p('@theme {');
p('  /* Type face */');
p('  --font-berkeley: ' + data.font.family + ';');
p();
p('  /* Colors — mode-invariant (identical Light/Dark): straight literals */');
for (const v of modeInvariantColors) {
  p('  --color-' + slug(v.name) + ': ' + v.values[data.colors.modes[0]] + ';');
}
if (contextInvariantSizes.length) {
  p();
  p('  /* Type sizes — context-invariant (identical across all contexts) */');
  for (const v of contextInvariantSizes) {
    p('  --text-' + sizeSlug(v.name) + ': ' + v.values[data.sizes.modes[0]] + 'px;');
  }
}
p('}');
p();

// ---- mode-varying COLORS: raw --bh-* layer + @theme inline ----------------
const modeVaryingColors = data.colors.variables.filter(
  (v) => !modeInvariantColors.includes(v)
);
const [lightMode, darkMode] = data.colors.modes;

// Auto-flag alpha mismatches between modes. A token that carries alpha in one
// mode (#rrggbbaa) but not the other (#rrggbb) is almost always an authoring
// slip — e.g. the atmospheric wash/* tokens, which are low-opacity in Light but
// were authored opaque in Dark, so they'd paint as solid blobs on a dark bg.
const hasAlpha = (hex) => typeof hex === 'string' && /^#[0-9a-fA-F]{8}$/.test(hex);
const alphaSuspect = new Set(
  modeVaryingColors
    .filter((v) => hasAlpha(v.values[lightMode]) !== hasAlpha(v.values[darkMode]))
    .map((v) => v.name)
);

p('/* ── Colors — mode-varying. Each token keeps its own per-mode literal');
p('   (no aliasing); the --bh-* layer only carries the Light/Dark axis. */');
p(':root {');
for (const v of modeVaryingColors) {
  p('  --bh-' + slug(v.name) + ': ' + v.values[lightMode] + ';');
}
p('}');
p('/* Dark is authored in Figma but no toggle is wired this pass (tokens only),');
p('   so :root stays Light until something sets [data-theme="dark"]. */');
if (alphaSuspect.size) {
  p('/* ⚠ UNVERIFIED: ' + [...alphaSuspect].join(', ') + ' carry alpha in Light but');
  p('   are opaque in Dark — likely a dropped alpha channel in the Figma Dark mode.');
  p('   Fix in Figma (re-add alpha, keep the Dark hue) and `npm run tokens`. Until');
  p('   then, do NOT wire [data-theme="dark"]: these render as solid blobs. */');
}
p('[data-theme="dark"] {');
for (const v of modeVaryingColors) {
  const flag = alphaSuspect.has(v.name) ? '  /* ⚠ UNVERIFIED — opaque, expected alpha */' : '';
  p('  --bh-' + slug(v.name) + ': ' + v.values[darkMode] + ';' + flag);
}
p('}');
p();
p('@theme inline {');
for (const v of modeVaryingColors) {
  const s = slug(v.name);
  p('  --color-' + s + ': var(--bh-' + s + ');');
}
p('}');
p();

// ---- context-varying SIZES: raw --bh-size-* layer + @theme inline ---------
const contextVaryingSizes = data.sizes.variables.filter(
  (v) => !contextInvariantSizes.includes(v)
);
const sel = data.sizes.modeSelectors;
const [webMode, ...otherModes] = data.sizes.modes;

p('/* ── Type sizes — context-varying. Web is the :root default; the four');
p('   capture/broadcast contexts override the same --bh-size-* names.');
p('   Independent of [data-theme]: /tv will opt into [data-context="tv"]. */');
p(sel[webMode] + ' {');
for (const v of contextVaryingSizes) {
  p('  --bh-size-' + sizeSlug(v.name) + ': ' + v.values[webMode] + 'px;');
}
p('}');
for (const mode of otherModes) {
  p(sel[mode] + ' { /* ' + mode + ' */');
  for (const v of contextVaryingSizes) {
    p('  --bh-size-' + sizeSlug(v.name) + ': ' + v.values[mode] + 'px;');
  }
  p('}');
}
p();
p('@theme inline {');
for (const v of contextVaryingSizes) {
  const s = sizeSlug(v.name);
  p('  --text-' + s + ': var(--bh-size-' + s + ');');
}
p('}');
p();

// ---- text styles reference (composite Figma text styles) ------------------
// These are NOT Figma variables and are not emitted as utilities this pass
// (no component work yet). Captured here so the future type-role pass can build
// .type-* classes deliberately. Font size flows through the --text-* tokens
// above (so it inherits [data-context]); weight/leading/tracking listed raw.
const fmtLen = (l) =>
  !l ? '—' : l.unit === 'AUTO' ? 'auto' : l.unit === 'PERCENT' ? l.value + '%' : l.value + 'px';

p('/* ── Text styles (reference) — composite Figma text styles, all Berkeley');
p('   Mono. Size → the --text-* token named; leading/tracking/weight raw.');
p('   Not emitted as classes yet (tokens-only pass).');
p('');
for (const t of data.textStyles) {
  const sizeTok = '--text-' + sizeSlug(t.sizeVar);
  const line =
    '   ' + t.name.padEnd(24) +
    ' w' + t.weight +
    '  ' + sizeTok +
    '  lh ' + fmtLen(t.lineHeight) +
    '  tracking ' + fmtLen(t.letterSpacing) +
    (t.textCase && t.textCase !== 'ORIGINAL' ? '  case ' + t.textCase : '');
  p(line);
}
p('   ───────────────────────────────────────────────────────────────────── */');
p();

writeFileSync(OUT, out.join('\n'));
console.log(
  'Wrote ' + OUT + '  (' +
    modeInvariantColors.length + ' invariant + ' + modeVaryingColors.length + ' mode-varying colors, ' +
    contextInvariantSizes.length + ' invariant + ' + contextVaryingSizes.length + ' context-varying sizes, ' +
    data.textStyles.length + ' text styles)'
);
