// Build-time invariant: every HTTP handler under app/api/admin/** must call
// requireAdmin() in its body. proxy.ts gates the path prefix, but the per-
// handler check is the defense-in-depth layer — and it only works if it's on
// EVERY handler, including ones added after the original sweep. This script
// fails the build (see package.json "build") when a handler lacks the call.
//
// Deliberately unguarded routes go in the allowlist below with a reason.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ADMIN_API_DIR = join(ROOT, 'app', 'api', 'admin');

// Paths (relative to app/api/admin) that must NOT require a session.
const ALLOWLIST = new Set([
  'login/route.ts', // it IS the login
  'logout/route.ts', // must clear the cookie even when the session is dead
]);

function collectRouteFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectRouteFiles(full, out);
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const HANDLER_RE = /^export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;
const NEXT_EXPORT_RE = /^export\s/gm;

const failures = [];
let handlersChecked = 0;

for (const file of collectRouteFiles(ADMIN_API_DIR)) {
  const rel = relative(ADMIN_API_DIR, file);
  if (ALLOWLIST.has(rel)) continue;

  const text = readFileSync(file, 'utf8');
  const handlers = [...text.matchAll(HANDLER_RE)];
  for (let i = 0; i < handlers.length; i++) {
    handlersChecked += 1;
    const start = handlers[i].index;
    // The handler's body runs until the next top-level export (or EOF).
    NEXT_EXPORT_RE.lastIndex = start + 1;
    const next = NEXT_EXPORT_RE.exec(text);
    const body = text.slice(start, next ? next.index : text.length);
    if (!body.includes('requireAdmin(')) {
      failures.push(`app/api/admin/${rel} — ${handlers[i][1]} has no requireAdmin() call`);
    }
  }
}

if (failures.length > 0) {
  console.error('Unguarded admin API handlers (add `const denied = await requireAdmin(); if (denied) return denied;`):');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-admin-guards: ${handlersChecked} handlers guarded.`);
