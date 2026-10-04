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
//   --bh-* raw     — ONLY for tokens that vary across a mode axis; the
//                    indirection exists solely to carry the mode. If a
//                    collection is single-mode (or every value is identical
//                    across modes), no --bh-* layer and no mode selector are
//                    emitted — the tokens are plain @theme literals.
//   @theme inline  — semantics: --color-* / --text-* resolve --bh-* at use site,
//                    and Figma variable ALIASES (e.g. series/fc -> spectrum/amber)
//                    resolve the target's --color-* — the alias stays an alias,
//                    never a copied hex.
//
// Figma variable descriptions ride along as trailing comments. A description
// starting with "DEPRECATED" moves the token into a flagged block at the end of
// its tier — still emitted (existing bindings keep working), but marked.
//
// The legacy/* group is NOT emitted. Figma parks retired tokens there (pre-2027
// values kept for reference); they stay in the snapshot so the history is
// diffable, but nothing in code should resolve them. A live token aliasing a
// legacy/* one fails the build.
//
// Axes compose and are independent:
//   [data-theme=dark]  flips mode-varying COLORS (Light default on :root)
//   [data-context=...] flips context-varying SIZES (Web default on :root)
//
// Paths can be overridden with TOKENS_SRC / TOKENS_OUT (used for testing the
// single-mode collapse without touching the committed files).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.TOKENS_SRC || join(root, 'app/redesign/tokens.figma.json');
const OUT = process.env.TOKENS_OUT || join(root, 'app/redesign/tokens.css');

const data = JSON.parse(readFileSync(SRC, 'utf8'));

const isLegacy = (name) => name.startsWith('legacy/');
const legacyColors = data.colors.variables.filter((v) => isLegacy(v.name));
data.colors.variables = data.colors.variables.filter((v) => !isLegacy(v.name));

// Figma group separator `/` becomes a CSS-safe `-`.
const slug = (name) => name.replace(/\//g, '-');
// Size tokens drop the leading `size/` group: size/header-1 -> header-1.
const sizeSlug = (name) => slug(name.replace(/^size\//, ''));

const allEqual = (vals) => vals.every((v) => v === vals[0]);

// Alias values are captured as { alias: "<figma name>" }. An alias must point
// at the same target in every mode — a per-mode alias would need the --bh-*
// layer and hasn't come up, so fail loudly rather than emit something wrong.
const aliasOf = (v, modes) => {
  const vals = modes.map((m) => v.values[m]);
  const isAlias = (x) => x !== null && typeof x === 'object' && 'alias' in x;
  if (!vals.some(isAlias)) return null;
  if (!vals.every((x) => isAlias(x) && x.alias === vals[0].alias)) {
    throw new Error(v.name + ': alias differs across modes (unsupported)');
  }
  return vals[0].alias;
};
const isDeprecated = (v) => /^DEPRECATED\b/.test(v.description || '');
const note = (v) => (v.description ? '  /* ' + v.description + ' */' : '');

const out = [];
const p = (s = '') => out.push(s);

// ---- classify -------------------------------------------------------------
const colorModes = data.colors.modes;
const aliasColors = data.colors.variables.filter((v) => aliasOf(v, colorModes));
const literalColors = data.colors.variables.filter((v) => !aliasColors.includes(v));
for (const v of aliasColors) {
  const target = aliasOf(v, colorModes);
  if (isLegacy(target)) {
    throw new Error(v.name + ': aliases ' + target + ' (legacy/* is not emitted)');
  }
  if (!data.colors.variables.some((t) => t.name === target)) {
    throw new Error(v.name + ': alias target ' + target + ' is not in the snapshot');
  }
}
const modeInvariantColors = literalColors.filter((v) =>
  allEqual(colorModes.map((m) => v.values[m]))
);
const modeVaryingColors = literalColors.filter((v) => !modeInvariantColors.includes(v));
const colorVaries = modeVaryingColors.length > 0;

const contextInvariantSizes = data.sizes.variables.filter((v) =>
  allEqual(data.sizes.modes.map((m) => v.values[m]))
);
const contextVaryingSizes = data.sizes.variables.filter(
  (v) => !contextInvariantSizes.includes(v)
);

// ---- header ---------------------------------------------------------------
p('/* ─────────────────────────────────────────────────────────────────────');
p('   Birdhaus design tokens — GENERATED FILE, DO NOT EDIT BY HAND.');
p('   Source: ' + data.source + ' (Figma published library)');
p('   Captured: ' + data.capturedAt + '   ·   Regenerate: `npm run tokens`');
p('   Edit values in app/redesign/tokens.figma.json, never here.');
if (legacyColors.length) {
  p('   ' + legacyColors.length + ' legacy/* colors in the snapshot are intentionally not emitted.');
}
p('   ───────────────────────────────────────────────────────────────────── */');
p();

// ---- @theme primitives ----------------------------------------------------
p('@theme {');
// Every Figma text style must use the DS family at a weight we self-host
// (app/redesign/commit-mono.css). Fail loudly on drift — a new weight in Figma
// would otherwise fall back to a browser-synthesised bold without anyone noticing.
const faceName = data.font.family.split(',')[0].trim().replace(/^"|"$/g, '');
for (const t of data.textStyles) {
  if (!t.font.startsWith(faceName + ' ')) {
    throw new Error(t.name + ': font ' + t.font + ' is not ' + faceName);
  }
  if (!data.font.weights.includes(t.weight)) {
    throw new Error(t.name + ': weight ' + t.weight + ' is not self-hosted (' + data.font.weights.join('/') + ')');
  }
}
p('  /* Type face — self-hosted ' + faceName + ' ' + data.font.weights.join('/') + ' (app/redesign/commit-mono.css) */');
p('  --font-' + data.font.token + ': ' + data.font.family + ';');
p();
p(
  colorVaries
    ? '  /* Colors — mode-invariant (identical across ' + colorModes.join('/') + '): literals */'
    : '  /* Colors — single-mode collection (' + colorModes.join(', ') + '): all literals */'
);
const colorLiteral = (v) => '  --color-' + slug(v.name) + ': ' + v.values[colorModes[0]] + ';';
for (const v of modeInvariantColors.filter((v) => !isDeprecated(v))) {
  p(colorLiteral(v) + note(v));
}
const deprecatedLiterals = modeInvariantColors.filter(isDeprecated);
if (deprecatedLiterals.length) {
  p();
  p('  /* ⚠ DEPRECATED — flagged in Figma, not part of the 2027 palette. Still');
  p('     emitted so existing uses keep resolving; do not use in new work.');
  p('     Remove from Figma first, then `npm run tokens` drops them here. */');
  for (const v of deprecatedLiterals) p(colorLiteral(v) + note(v));
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
// Emitted only when the color collection actually varies across modes. Single-
// mode collapses to the @theme literals above — no --bh-* layer, no selector.
if (colorVaries) {
  const [lightMode, darkMode] = colorModes;

  // Auto-flag alpha mismatches between modes. A token that carries alpha in one
  // mode (#rrggbbaa) but not the other (#rrggbb) is almost always an authoring
  // slip — e.g. atmospheric wash/* tokens that are low-opacity in Light but were
  // authored opaque in Dark, so they'd paint as solid blobs on a dark bg.
  const hasAlpha = (hex) => typeof hex === 'string' && /^#[0-9a-fA-F]{8}$/.test(hex);
  const alphaSuspect = new Set(
    modeVaryingColors
      .filter((v) => hasAlpha(v.values[lightMode]) !== hasAlpha(v.values[darkMode]))
      .map((v) => v.name)
  );

  p('/* ── Colors — mode-varying. Each token keeps its own per-mode literal');
  p('   (no aliasing); the --bh-* layer only carries the ' + colorModes.join('/') + ' axis. */');
  p(':root {');
  for (const v of modeVaryingColors) {
    p('  --bh-' + slug(v.name) + ': ' + v.values[lightMode] + ';');
  }
  p('}');
  p('/* ' + darkMode + ' is authored in Figma but no toggle is wired this pass (tokens');
  p('   only), so :root stays ' + lightMode + ' until something sets [data-theme="dark"]. */');
  if (alphaSuspect.size) {
    p('/* ⚠ UNVERIFIED: ' + [...alphaSuspect].join(', ') + ' carry alpha in ' + lightMode + ' but');
    p('   are opaque in ' + darkMode + ' — likely a dropped alpha channel in the Figma ' + darkMode + ' mode.');
    p('   Fix in Figma (re-add alpha, keep the ' + darkMode + ' hue) and `npm run tokens`. Until');
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
}

// ---- color ALIASES: @theme inline over the target's --color-* ---------------
// Semantic tier. The utility (bg-series-fc) inlines var(--color-spectrum-amber),
// so retuning the bar in Figma retunes every alias with it.
if (aliasColors.length) {
  p('/* ── Colors — aliases. Semantic names that point at another token (Figma');
  p('   variable alias). Resolved at use site; no value of their own. */');
  p('@theme inline {');
  for (const v of aliasColors) {
    const line =
      '  --color-' + slug(v.name) + ': var(--color-' + slug(aliasOf(v, colorModes)) + ');';
    p(line + (isDeprecated(v) ? '  /* ⚠ ' : '  /* ') + (v.description || '→ ' + aliasOf(v, colorModes)) + ' */');
  }
  p('}');
  p();
}

// ---- context-varying SIZES: raw --bh-size-* layer + @theme inline ---------
const sel = data.sizes.modeSelectors;
const [webMode, ...otherModes] = data.sizes.modes;

if (contextVaryingSizes.length) {
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
}

// ---- text styles reference (composite Figma text styles) ------------------
// These are NOT Figma variables and are not emitted as utilities this pass
// (no component work yet). Captured so the future type-role pass can build
// .type-* classes deliberately. Font size flows through the --text-* tokens
// above (so it inherits [data-context]); weight/leading/tracking listed raw.
const fmtLen = (l) =>
  !l ? '—' : l.unit === 'AUTO' ? 'auto' : l.unit === 'PERCENT' ? l.value + '%' : l.value + 'px';

p('/* ── Text styles (reference) — composite Figma text styles, all ' + faceName + '.');
p('   Size → the --text-* token named; leading/tracking/weight raw.');
p('   Not emitted as classes yet (tokens-only pass).');
if (data.textStylesCapturedAt && data.textStylesCapturedAt !== data.capturedAt) {
  p('   Captured ' + data.textStylesCapturedAt + ' — NOT re-captured on ' + data.capturedAt + '.');
}
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
    modeInvariantColors.length + ' invariant + ' + modeVaryingColors.length + ' mode-varying + ' +
    aliasColors.length + ' alias colors (' + legacyColors.length + ' legacy skipped), ' +
    contextInvariantSizes.length + ' invariant + ' + contextVaryingSizes.length + ' context-varying sizes, ' +
    data.textStyles.length + ' text styles)'
);
