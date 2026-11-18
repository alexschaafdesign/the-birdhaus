// Build guard for the 2027 admin: admin UI uses design-system tokens only
// (app/redesign/tokens.css), with square corners. Fails on raw hex colours,
// Tailwind palette colours (emerald-400, yellow-500, white, black…) and
// rounded-* classes in components/admin and app/admin.
//
// Allowed:
// - rounded-none, and `rounded` as a JS identifier (const rounded = …).
// - CSS inside a <style>…</style> block (the RSVP print window).
// - Lines right after an `admin-tokens-ok` comment (covers the next 3 lines),
//   for brand marks such as the Venmo logo.
// - The files in LEGACY below, with their reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['components/admin', 'app/admin', 'components/hub', 'components/door', 'app/hub', 'app/door'];

const LEGACY = {
  // react-pdf documents take plain colour values, not Tailwind classes.
  'components/admin/SettlementPdfDocument.tsx': 'PDF',
  'components/admin/InputsPdfDocument.tsx': 'PDF',
};

const RULES = [
  ['hex colour', /#[0-9a-fA-F]{6}\b|\[#[0-9a-fA-F]{3,8}\]|["'`]#[0-9a-fA-F]{3}["'`]/],
  [
    'palette colour',
    /(?<![\w-])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|divide|placeholder)-(?:emerald|amber|yellow|sky|blue|green|rose|purple|red|zinc|stone|neutral|gray|slate|orange|lime|teal|cyan|indigo|violet|fuchsia|pink|black|white)\b/,
  ],
  ['rounded corners', /(?:^|[\s"'`:])rounded(?!-none\b)(?:-[a-z0-9]+)*(?=[\s"'`]|$)(?![ \t]*[=!<>)*/+,;?:-])/],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
let files = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (LEGACY[rel]) continue;
    files++;
    const lines = readFileSync(file, 'utf8').split('\n');
    let inStyle = false;
    let okFor = 0;
    lines.forEach((line, i) => {
      if (line.includes('<style')) inStyle = true;
      const skip = inStyle || okFor > 0;
      if (line.includes('</style>')) inStyle = false;
      if (okFor > 0) okFor--;
      if (line.includes('admin-tokens-ok')) {
        okFor = 3;
        return;
      }
      if (skip) return;
      for (const [what, re] of RULES) {
        if (re.test(line)) problems.push(`${rel}:${i + 1}: ${what}: ${line.trim().slice(0, 140)}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`check-admin-tokens: ${problems.length} problem(s). Use DS tokens (bg-surface-*, text-accent-red, bg-spectrum-*) and square corners.`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check-admin-tokens: ${files} admin files, tokens only.`);
