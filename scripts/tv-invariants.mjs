// /tv poll-boundary invariants. Would have caught the "refetch resets the
// screen" class of bug — twice.
//
// Drives the real page in headless Chrome over CDP and asserts, across
// several /api/tv poll boundaries:
//   1. a poll returning IDENTICAL data causes zero visible change
//   2. a poll returning CHANGED data (one response is mutated in-flight to
//      add a show) updates content without resetting bounce position
//   3. the page never navigates/reloads after the first load
//   4. the moving element never vanishes and never snaps back to origin
//
// Usage: with the app running (dev or prod build):
//   node scripts/tv-invariants.mjs [base-url]
// Defaults to http://127.0.0.1:3000. Exits 0 on pass, 1 on any violation.
// Uses macOS Chrome by default; override with CHROME=/path/to/chrome.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
// Fast poll (3s) so the run crosses ~5 boundaries; forced bounce so the
// moving element exists regardless of what's on the calendar today; fast
// bounce (3s crossings) so edge-hit flyer swaps happen many times per run —
// cycling to the next show must never navigate, reload, or reset motion.
const PAGE_URL = `${BASE}/tv?bounce=1&poll=3&bounceperiod=3`;
const RUN_MS = 22_000;
const SAMPLE_MS = 300;
const MUTATE_ON_POLL = 3; // which /api/tv response gets a show appended
const JUMP_LIMIT_PX = 120; // legit motion is ~35px/s; a swap-clamp is <100px
const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
};

// ---- launch chrome ---------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'tv-invariants-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);
process.on('exit', () => {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // chrome may still be flushing its profile as it dies; a leftover tmp
    // dir is not worth failing the run over
  }
});

// Chrome writes the chosen debugging port to DevToolsActivePort in the profile.
let port = null;
for (let i = 0; i < 50 && !port; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  } catch {
    /* not written yet */
  }
}
if (!port) {
  fail('chrome did not expose a devtools port');
  process.exit(1);
}

// ---- CDP plumbing ----------------------------------------------------------
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

let pollCount = 0;
let navCount = 0;

ws.onmessage = async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) {
    navCount++;
    if (navCount > 1) fail(`page reloaded/navigated mid-run (#${navCount}): ${msg.params.frame.url}`);
  }
  if (msg.method === 'Fetch.requestPaused') {
    const { requestId } = msg.params;
    // Belt and suspenders alongside the escaped patterns: only the poll
    // endpoint itself gets counted/mutated, anything else passes through.
    if (!/\/api\/tv(\?|$)/.test(msg.params.request.url)) {
      await send('Fetch.continueResponse', { requestId });
      return;
    }
    pollCount++;
    const bodyRes = await send('Fetch.getResponseBody', { requestId });
    let body = bodyRes.base64Encoded
      ? Buffer.from(bodyRes.body, 'base64').toString('utf8')
      : bodyRes.body;
    if (pollCount === MUTATE_ON_POLL) {
      // Changed-data poll: append a flyerless show. The page must swap
      // content in without any motion reset.
      const json = JSON.parse(body);
      json.upcoming = [
        ...(json.upcoming ?? []),
        { title: 'INVARIANT PROBE', date: '2099-01-01', flyer: null, bands: [] },
      ];
      body = JSON.stringify(json);
      console.log(`poll #${pollCount}: mutated payload injected`);
    } else {
      console.log(`poll #${pollCount}: passed through unchanged`);
    }
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(body).toString('base64'),
    });
  }
};

await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
// Match only the poll endpoint — '*/api/tv*' would also catch the flyer
// variants at /api/tv/img and feed JPEG bytes to JSON.parse. In CDP url
// patterns '?' is a single-char wildcard, so the literal one is escaped.
await send('Fetch.enable', {
  patterns: [
    { urlPattern: '*/api/tv', requestStage: 'Response' },
    { urlPattern: '*/api/tv\\?*', requestStage: 'Response' },
  ],
});
await send('Runtime.enable');
await send('Page.navigate', { url: PAGE_URL });

// ---- sample the moving element --------------------------------------------
let prev = null; // {x, y}
let everSeen = false;
let prevContent = null;
let swapCount = 0;
const sample = async () => {
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('[class*="bounceItem"]');
      if (!el) return null;
      const m = /translate3d\\((-?[\\d.]+)px, (-?[\\d.]+)px/.exec(el.style.transform || '');
      const img = el.querySelector('img');
      const card = el.querySelector('[class*="bounceCard"]');
      const content = card ? 'card:' + card.textContent : 'img:' + (img ? img.src : '');
      return m ? { x: Number(m[1]), y: Number(m[2]), content } : { x: 0, y: 0, content };
    })()`,
    returnByValue: true,
  });
  const pos = res?.result?.value ?? null;
  if (pos) {
    if (prevContent !== null && pos.content !== prevContent) swapCount++;
    prevContent = pos.content;
  }
  if (!pos) {
    if (everSeen) fail('bounce element vanished mid-run (loading state or mode flap)');
    return;
  }
  everSeen = true;
  if (prev) {
    const dist = Math.hypot(pos.x - prev.x, pos.y - prev.y);
    const nearOrigin = Math.hypot(pos.x, pos.y) < 6;
    const wasFar = Math.hypot(prev.x, prev.y) > 80;
    if (dist > JUMP_LIMIT_PX) {
      fail(`position jumped ${dist.toFixed(0)}px in one sample (${JSON.stringify(prev)} -> ${JSON.stringify(pos)})`);
    }
    if (nearOrigin && wasFar) {
      fail(`position snapped back to origin (${JSON.stringify(prev)} -> ${JSON.stringify(pos)}) — remount`);
    }
  }
  prev = pos;
};
const sampler = setInterval(sample, SAMPLE_MS);

await new Promise((r) => setTimeout(r, RUN_MS));
clearInterval(sampler);

if (!everSeen) fail('bounce element never appeared');
if (pollCount < MUTATE_ON_POLL + 1) {
  fail(`only ${pollCount} polls observed; need at least ${MUTATE_ON_POLL + 1} to cover the changed-data case`);
}
if (swapCount < 3) {
  fail(`only ${swapCount} edge-hit flyer swaps observed; need >=3 to cover the cycle path`);
}

console.log(
  failures.length === 0
    ? `PASS — ${pollCount} polls (1 mutated), ${swapCount} flyer swaps, no navigations, no resets, no vanishing`
    : `${failures.length} violation(s)`
);
process.exit(failures.length === 0 ? 0 : 1);
