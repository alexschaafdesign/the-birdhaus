// Build-time invariant: no `select *`, `alias.*` or `returning *` in app SQL.
//
// The app reaches Postgres through Neon's pooler, which shares prepared
// statements by query text. A star query's result shape is fixed when it's
// prepared, so after a migration adds or drops a column every new connection
// fails with "cached plan must not change result type" until the pooler's
// server connections recycle — on prod, the live site returning 500s, and
// restarting the app doesn't help. Queries name their columns instead (e.g.
// ${sql(SHOW_COLUMNS)} from lib/shows). This script fails the build (see
// package.json "build") when a star creeps back in.
//
// Scans every template literal under app/, lib/ and components/ that reads as
// SQL, nested `sql` fragments included, so multi-line queries are covered.
//
// The one allowed shape: a star over a subquery that lists its own columns,
// whose result shape only changes when code does. Mark it with a comment in
// one of the three lines above the query:
//   // select-star-ok: q is a subquery with its own column list (TRACK_SELECT_IN_ROUND)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['app', 'lib', 'components'];
const ALLOW_RE = /\/\/\s*select-star-ok:\s*\S/;

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, out);
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

// Reads a template literal whose opening backtick is just before `i`, inlining
// any nested template literals inside ${...}. Returns [text, indexAfterClose].
function readTemplate(src, i) {
  let out = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
    if (c === '`') return [out, i + 1];
    if (c === '$' && src[i + 1] === '{') {
      let depth = 1;
      i += 2;
      out += ' ${ ';
      while (i < src.length && depth > 0) {
        if (src[i] === '`') {
          const [inner, next] = readTemplate(src, i + 1);
          out += inner;
          i = next;
          continue;
        }
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
      out += ' } ';
      continue;
    }
    out += c;
    i += 1;
  }
  return [out, i];
}

// Every top-level template literal in a file: { start, text }. Skips ordinary
// strings and comments so a backtick inside them isn't mistaken for one.
function* templateLiterals(src) {
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      i += 1;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === '`') {
      const [text, next] = readTemplate(src, i + 1);
      yield { start: i, text };
      i = next;
      continue;
    }
    i += 1;
  }
}

const IS_SQL_RE = /\b(?:select|returning)\b/i;
const STAR_RES = [
  /\bselect\s+(?:distinct\s+(?:on\s*\([^)]*\)\s*)?)?\*/gi, // select *
  /\breturning\s+\*/gi, // returning *
  /,\s*\*\s*(?=,|\bfrom\b)/gi, // select a, *, b
  /\b[a-z_][a-z0-9_]*\.\*/gi, // alias.*
];

const failures = [];
let queriesChecked = 0;
let allowed = 0;

for (const dir of DIRS) {
  for (const file of collectSourceFiles(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    for (const { start, text } of templateLiterals(src)) {
      if (!IS_SQL_RE.test(text)) continue;
      queriesChecked += 1;
      const stars = STAR_RES.flatMap((re) => [...text.matchAll(re)]);
      if (stars.length === 0) continue;

      const startLine = src.slice(0, start).split('\n').length;
      const above = src.split('\n').slice(Math.max(0, startLine - 4), startLine - 1);
      if (above.some((line) => ALLOW_RE.test(line))) {
        allowed += 1;
        continue;
      }
      for (const m of stars) {
        const line = startLine + text.slice(0, m.index).split('\n').length - 1;
        failures.push(`${relative(ROOT, file)}:${line} — ${m[0].replace(/\s+/g, ' ')}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Star queries in app SQL (name the columns, e.g. ${sql(SHOW_COLUMNS)} — see CLAUDE.md):');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check-no-select-star: ${queriesChecked} SQL queries, no stars` +
    (allowed ? ` (${allowed} allowed subquery star${allowed === 1 ? '' : 's'}).` : '.')
);
