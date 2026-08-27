'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './tv.module.css';

// The in-venue CRT display (/tv), running unattended on a Raspberry Pi for a
// whole show night. Operating rules are stricter than a normal page:
//   - never blank: hold the last good payload when a fetch fails
//   - never throw out of render: malformed fields degrade to blanks, and the
//     body is wrapped in try/catch that falls back to an idle card
//   - never show a broken image: images render only after a successful preload
//   - cheap: DOM text + a couple of pre-decoded images, no heavy JS
//
// The tube is now an authored CMS. The feed hands over a PROGRAM (which mode is
// live, via override / schedule / default) plus each mode's authored content;
// nothing is derived from show tables or the clock beyond picking the schedule
// window. Three modes:
//   - SCREENSAVER: the curated image pool as a DVD-bounce (each edge hit swaps
//     to the next image). Owns the whole stage, no header.
//   - BOARD: a titled list of time/label rows (the run-of-show), one static
//     card under the header.
//   - CARDS: authored announcement cards (headline + subtext + optional image)
//     rotated under the header.
// The client resolves the active mode against its own venue clock, so a
// scheduled transition lands the moment it's due and ?t preview works. Fetching
// feeds all modes; the clock tick, rotation, and bounce loop never fetch.

const POLL_MS = 60_000; // re-fetch /api/tv
const DWELL_MS = 8_000; // per-slide hold (rotation)
const FADE_MS = 600; // matches .deck's opacity transition

// The venue day runs until 04:00, so schedule math is in "minutes since 04:00".
const DAY_START_MIN = 4 * 60;
const VENUE_TZ = 'America/Chicago';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const venueClockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: VENUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type TvMode = 'screensaver' | 'board' | 'cards';
const TV_MODES: readonly TvMode[] = ['screensaver', 'board', 'cards'];
function isTvMode(v: unknown): v is TvMode {
  return typeof v === 'string' && (TV_MODES as readonly string[]).includes(v);
}

interface ScheduleWindow {
  from: string; // 24h "HH:MM" venue-local
  mode: TvMode;
}
interface TvProgram {
  defaultMode: TvMode;
  schedule: ScheduleWindow[];
  overrideMode: TvMode | null;
}
interface TvBoardRow {
  time: string;
  label: string;
}
interface TvBoard {
  title: string | null;
  rows: TvBoardRow[];
}
interface TvCard {
  headline: string;
  subtext: string | null;
  image: string | null;
}
interface TvPoolImage {
  url: string;
  caption: string | null;
}
interface TvData {
  date: string;
  program: TvProgram;
  board: TvBoard;
  cards: TvCard[];
  pool: TvPoolImage[];
}

interface VenueParts {
  y: number;
  mo: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

// Loose shape check before swapping in a payload — a half-broken response keeps
// the previous good data instead of poisoning the loop.
function isTvData(body: unknown): body is TvData {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    !!b.program &&
    typeof b.program === 'object' &&
    Array.isArray(b.cards) &&
    Array.isArray(b.pool) &&
    !!b.board &&
    typeof b.board === 'object'
  );
}

// "2026-08-29" -> "SAT AUG 29". Parsed by hand so it stays a plain calendar
// date (new Date("2026-08-29") would reinterpret through UTC).
function formatDate(iso: string | null | undefined): string {
  if (!iso || !ISO_DATE.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

// Minutes since 04:00 for a real venue instant.
function slotOfParts(v: VenueParts): number {
  let mins = v.hh * 60 + v.mm + v.ss / 60;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}

// Minutes since 04:00 for a board row's free-text time ("7:30pm", "8–8:30pm",
// "8"). PM is assumed, matching the schedule editor. Uses the row's START time.
function boardStartSlot(time: string): number | null {
  const cleaned = time.toLowerCase().replace(/am|pm/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;
  const first = cleaned.split(/–|—|-|to/)[0];
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(first);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (h < 1 || h > 12 || mm > 59) return null;
  if (h !== 12) h += 12; // PM
  let mins = h * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}

// Index of the "current" board row: the last one whose start time has passed.
// -1 before anything has started (or no clock).
function currentBoardIndex(rows: TvBoardRow[], nowSlot: number | null): number {
  if (nowSlot === null) return -1;
  let idx = -1;
  rows.forEach((r, i) => {
    const s = boardStartSlot(r.time);
    if (s !== null && nowSlot >= s) idx = i;
  });
  return idx;
}

// Minutes since 04:00 for a schedule window's 24h "HH:MM"; null if malformed.
function slotOfHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  let mins = hh * 60 + mm;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}

// Which mode the program resolves to now: override wins; else the last schedule
// window whose start has passed; else the default.
function resolveMode(program: TvProgram, nowSlot: number | null): TvMode {
  if (program.overrideMode && isTvMode(program.overrideMode)) return program.overrideMode;
  let mode: TvMode = isTvMode(program.defaultMode) ? program.defaultMode : 'screensaver';
  if (nowSlot === null) return mode;
  const windows = (Array.isArray(program.schedule) ? program.schedule : [])
    .map((w) => ({ slot: slotOfHHMM(w?.from ?? ''), mode: w?.mode }))
    .filter((w): w is { slot: number; mode: TvMode } => w.slot !== null && isTvMode(w.mode))
    .sort((a, b) => a.slot - b.slot);
  for (const w of windows) {
    if (nowSlot >= w.slot) mode = w.mode;
  }
  return mode;
}

function venuePartsOf(date: Date): VenueParts {
  const parts = venueClockFmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    hh: get('hour'),
    mm: get('minute'),
    ss: get('second'),
  };
}

// "2026-09-05T20:15" -> venue fields (interpreted literally as venue-local).
function parseT(value: string | null): VenueParts | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  return { y, mo, d, hh, mm, ss: 0 };
}

function venueDateIso(v: VenueParts): string {
  let dt = new Date(Date.UTC(v.y, v.mo - 1, v.d));
  if (v.hh < DAY_START_MIN / 60) dt = new Date(dt.getTime() - 86_400_000);
  return dt.toISOString().slice(0, 10);
}

function fmtClock(v: VenueParts): string {
  const h = v.hh % 12 || 12;
  return `${h}:${String(v.mm).padStart(2, '0')}`;
}

// Headline size steps down for long names so nothing wraps off the tube.
function bigClass(text: string, narrow = false): string {
  const longestWord = text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  const [xlongAt, longAt] = narrow ? [18, 10] : [26, 16];
  if (text.length > xlongAt || (narrow && longestWord > 15)) {
    return `${styles.big} ${styles.bigXlong}`;
  }
  if (text.length > longAt || longestWord > longAt) return `${styles.big} ${styles.bigLong}`;
  return styles.big;
}

// ---- screensaver (DVD-bounce) ---------------------------------------------
const BOUNCE_MAX_W = 384;
const BOUNCE_MAX_H = 272;
const BOUNCE_X_SECONDS = 10;
const BOUNCE_Y_SECONDS = 34;

interface BounceItem {
  title: string;
  date: string;
  flyer: string | null;
}

// The screensaver bounces the curated pool; a caption is the text-card
// fallback. An empty pool bounces the house mark so the tube is never blank.
function buildBounceItems(pool: TvPoolImage[]): BounceItem[] {
  const items: BounceItem[] = [];
  for (const img of Array.isArray(pool) ? pool : []) {
    if (img && typeof img.url === 'string' && img.url) {
      items.push({ title: typeof img.caption === 'string' ? img.caption : '', date: '', flyer: img.url });
    }
  }
  if (items.length === 0) items.push({ title: 'THE BIRDHAUS', date: '', flyer: null });
  return items;
}

// ?bounceperiod=<seconds> (floor 2) overrides both crossing speeds so the
// invariants script can force many edge-hit swaps in a short run.
function bouncePeriods(): { x: number; y: number } {
  const p = Number(new URLSearchParams(window.location.search).get('bounceperiod'));
  if (Number.isFinite(p) && p >= 2) return { x: p, y: p * 3.4 };
  return { x: BOUNCE_X_SECONDS, y: BOUNCE_Y_SECONDS };
}

const BounceLayer = memo(function BounceLayer({
  items,
  imgOk,
}: {
  items: BounceItem[];
  imgOk: Record<string, boolean>;
}) {
  const [idx, setIdx] = useState(0);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const itemRef = useRef<HTMLDivElement | null>(null);
  const motion = useRef({ x: 0, y: 0, dx: 1, dy: 1 });

  useEffect(() => {
    const period = bouncePeriods();
    let raf = 0;
    let last: number | null = null;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.25);
      last = t;
      const area = areaRef.current;
      const el = itemRef.current;
      if (!area || !el) return;
      const travelX = Math.max(0, area.clientWidth - el.offsetWidth);
      const travelY = Math.max(0, area.clientHeight - el.offsetHeight);
      const m = motion.current;
      m.x += m.dx * (travelX / period.x) * dt;
      m.y += m.dy * (travelY / period.y) * dt;
      let hit = false;
      if (m.x < 0) {
        m.x = 0;
        if (m.dx < 0) { m.dx = 1; hit = true; }
      } else if (m.x > travelX) {
        m.x = travelX;
        if (m.dx > 0) { m.dx = -1; hit = true; }
      }
      if (m.y < 0) {
        m.y = 0;
        if (m.dy < 0) { m.dy = 1; hit = true; }
      } else if (m.y > travelY) {
        m.y = travelY;
        if (m.dy > 0) { m.dy = -1; hit = true; }
      }
      el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      if (hit) setIdx((n) => n + 1);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const item = items[idx % items.length];
  const url = item.flyer;
  const flyerReady = !!url && imgOk[url] === true;
  const [lastFlyer, setLastFlyer] = useState<string | undefined>(undefined);
  if (flyerReady && lastFlyer !== url) setLastFlyer(url);

  return (
    <div ref={areaRef} className={styles.bounceArea}>
      <div ref={itemRef} className={styles.bounceItem} style={{ maxWidth: BOUNCE_MAX_W }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flyerReady ? url : lastFlyer}
          alt={flyerReady ? item.title || 'Screensaver image' : ''}
          style={{
            maxWidth: BOUNCE_MAX_W,
            maxHeight: BOUNCE_MAX_H,
            display: flyerReady ? 'block' : 'none',
          }}
        />
        {!flyerReady && (
          <div className={styles.bounceCard}>
            <div className={bigClass(item.title || 'THE BIRDHAUS')}>{item.title || 'THE BIRDHAUS'}</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default function TvScreen() {
  const [data, setData] = useState<TvData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [sim, setSim] = useState<VenueParts | null>(null);
  const [scale, setScale] = useState(1);
  const [scan, setScan] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // ?mode=screensaver|board|cards forces a mode for preview/testing; overrides
  // the program's resolution. null = follow the program.
  const [modePreview, setModePreview] = useState<TvMode | null>(null);
  const [slideNum, setSlideNum] = useState(0);
  const [fading, setFading] = useState(false);
  const [diag, setDiag] = useState('');
  const [imgOk, setImgOk] = useState<Record<string, boolean>>({});
  const preloadStarted = useRef<Set<string>>(new Set());
  const lastPayload = useRef<string | null>(null);
  // Deploy version this page booted on; when a poll reports a different one, a
  // new bundle has shipped and we reload once to pick it up (self-updating
  // kiosk — no manual Pi restart).
  const bootVersion = useRef<string | null>(null);

  // The rotation interval reads these so it idles (no state churn) while the
  // screensaver owns the stage or the current deck has only one slide.
  const bounceActiveRef = useRef(false);
  const deckLenRef = useRef(1);

  const pull = useCallback(async () => {
    try {
      // ?showId=N previews a specific show's program (the admin preview); absent
      // -> normal operation (tonight's show, else global).
      const showId = new URLSearchParams(window.location.search).get('showId');
      const qs = showId && /^\d+$/.test(showId) ? `?showId=${showId}` : '';
      const res = await fetch(`/api/tv${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (text === lastPayload.current) return; // identical poll -> zero work
      const body: unknown = JSON.parse(text);

      // Self-update: latch the version on first load; if a later poll reports a
      // different one, a new bundle shipped — reload once to run it. Guarded by
      // the identical-poll short-circuit above, so this only fires on a real
      // change. Skipped for 'dev' (hot-reload handles it) and when absent.
      const version =
        body && typeof body === 'object' && typeof (body as { version?: unknown }).version === 'string'
          ? (body as { version: string }).version
          : null;
      if (version && version !== 'dev') {
        if (bootVersion.current === null) {
          bootVersion.current = version;
        } else if (version !== bootVersion.current) {
          console.log(`[tv] new deploy ${bootVersion.current} -> ${version}, reloading`);
          window.location.reload();
          return;
        }
      }

      if (isTvData(body)) {
        lastPayload.current = text;
        setData(body);
      }
    } catch (err) {
      console.warn('tv: fetch failed, holding last data', err);
    }
  }, []);

  useEffect(() => {
    pull();
    const p = Number(new URLSearchParams(window.location.search).get('poll'));
    const ms = Number.isFinite(p) && p >= 2 ? p * 1000 : POLL_MS;
    const id = setInterval(pull, ms);
    return () => clearInterval(id);
  }, [pull]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScan(params.has('scanlines'));
    const modeParam = params.get('mode');
    if (isTvMode(modeParam)) setModePreview(modeParam);
    else if (params.get('bounce') === '1') setModePreview('screensaver'); // legacy alias
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Boot diagnostics: a kiosk that silently reloads looks like an app bug.
    // Count boots in localStorage and, with ?diag=1, show it. A healthy night
    // logs boot ONCE.
    try {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const navType = nav?.type ?? 'unknown';
      const bootCount = Number(localStorage.getItem('tv-boot-count') ?? '0') + 1;
      const prevBootAt = Number(localStorage.getItem('tv-boot-at') ?? '0');
      localStorage.setItem('tv-boot-count', String(bootCount));
      localStorage.setItem('tv-boot-at', String(Date.now()));
      const gap = prevBootAt ? Math.round((Date.now() - prevBootAt) / 1000) : null;
      console.log(
        `[tv] boot #${bootCount} type=${navType}${gap !== null ? ` +${gap}s since previous boot` : ''}`
      );
      if (params.has('diag')) {
        setDiag(`BOOT ${bootCount} · ${navType.toUpperCase()}${gap !== null ? ` · +${gap}s` : ''}`);
      }
    } catch {
      // localStorage unavailable (private mode etc.) — diagnostics only, skip
    }

    const fit = () => setScale(Math.min(window.innerWidth / 640, window.innerHeight / 480));
    fit();
    window.addEventListener('resize', fit);

    const simParts = parseT(params.get('t'));
    let clockId: ReturnType<typeof setInterval> | null = null;
    if (simParts) {
      setSim(simParts);
    } else {
      setNow(new Date());
      clockId = setInterval(() => setNow(new Date()), 1000);
    }

    return () => {
      if (clockId) clearInterval(clockId);
      window.removeEventListener('resize', fit);
    };
  }, []);

  // Rotation ticks only when the current deck has >1 slide and the screensaver
  // isn't the active view.
  useEffect(() => {
    const id = setInterval(() => {
      if (bounceActiveRef.current || deckLenRef.current < 2) return;
      setFading(true);
      setTimeout(() => {
        setSlideNum((n) => n + 1);
        setFading(false);
      }, FADE_MS);
    }, DWELL_MS);
    return () => clearInterval(id);
  }, []);

  // Decode every image off-screen once; a slide consults the outcome and a
  // failed/still-loading image just runs copy-only.
  useEffect(() => {
    const urls: string[] = [];
    for (const img of data?.pool ?? []) {
      if (img?.url) urls.push(img.url);
    }
    for (const card of data?.cards ?? []) {
      if (card?.image) urls.push(card.image);
    }
    for (const url of urls) {
      if (typeof url !== 'string' || preloadStarted.current.has(url)) continue;
      preloadStarted.current.add(url);
      const img = new window.Image();
      img.onload = () => {
        const decoded = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
        decoded.catch(() => {}).then(() => setImgOk((prev) => ({ ...prev, [url]: true })));
      };
      img.onerror = () => setImgOk((prev) => ({ ...prev, [url]: false }));
      img.src = url;
    }
  }, [data]);

  const venue: VenueParts | null = sim ?? (now ? venuePartsOf(now) : null);
  const nowSlot = venue ? slotOfParts(venue) : null;

  function headerDateIso(): string {
    if (data?.date) return data.date;
    if (!venue) return '';
    return venueDateIso(venue);
  }

  const idleSlide = (
    <div className={styles.slide}>
      <div className={`${styles.copy} ${styles.copyCentered}`}>
        <div className={styles.big}>THE BIRDHAUS</div>
        <div className={styles.sub}>{data ? '' : formatDate(headerDateIso())}</div>
      </div>
    </div>
  );

  // ---- board mode --------------------------------------------------------
  function renderBoard(board: TvBoard): React.ReactNode {
    const rows = (Array.isArray(board.rows) ? board.rows : []).filter(
      (r) => r && (r.time || r.label)
    );
    if (rows.length === 0) return idleSlide;
    const title = typeof board.title === 'string' ? board.title.trim() : '';
    const nowIdx = currentBoardIndex(rows, nowSlot);
    return (
      <div className={`${styles.slide} ${styles.slideCol}`}>
        <div className={styles.eyebrow}>{title || 'TONIGHT'}</div>
        <div className={styles.board}>
          {rows.map((r, i) => (
            <div
              key={i}
              className={`${styles.boardRow} ${i === nowIdx ? styles.boardRowNow : ''}`}
            >
              <span className={styles.boardTime}>{r.time}</span>
              <span className={styles.boardLabel}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- cards mode --------------------------------------------------------
  function renderCard(card: TvCard): React.ReactNode {
    const headline = typeof card.headline === 'string' ? card.headline : '';
    const subtext = typeof card.subtext === 'string' ? card.subtext.trim() : '';
    const url = card.image;
    const hasImg = !!url && imgOk[url] === true;
    return (
      <div className={`${styles.slide} ${styles.slideCol}`}>
        {hasImg && (
          <div className={styles.artCenter}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={headline || 'Card image'} />
          </div>
        )}
        <div className={`${styles.copy} ${styles.copyCentered}`}>
          {headline && <div className={bigClass(headline)}>{headline}</div>}
          {subtext && <div className={styles.sub}>{subtext}</div>}
        </div>
      </div>
    );
  }

  // Resolve the live mode (preview override wins), then build the current view.
  const program: TvProgram = data?.program ?? {
    defaultMode: 'screensaver',
    schedule: [],
    overrideMode: null,
  };
  const mode: TvMode = modePreview ?? resolveMode(program, nowSlot);

  const pool = useMemo(() => (Array.isArray(data?.pool) ? data!.pool : []), [data]);
  const bounceItems = useMemo(() => buildBounceItems(pool), [pool]);

  // Screensaver bounces unless the viewer asked for reduced motion, in which
  // case it falls back to a gentle fade-rotation of the same images.
  const screensaverBounces = mode === 'screensaver' && !reduceMotion;

  // The rotation deck (board = one card; cards = one per card; screensaver
  // fallback = one per pool image). Built as ready-to-render nodes.
  let deck: React.ReactNode[] = [];
  if (mode === 'board') {
    deck = data ? [renderBoard(data.board)] : [idleSlide];
  } else if (mode === 'cards') {
    const cards = Array.isArray(data?.cards) ? data!.cards : [];
    deck = cards.length > 0 ? cards.map((c) => renderCard(c)) : [idleSlide];
  } else if (mode === 'screensaver' && reduceMotion) {
    deck =
      pool.length > 0
        ? pool.map((img) => renderCard({ headline: img.caption ?? '', subtext: null, image: img.url }))
        : [idleSlide];
  }

  bounceActiveRef.current = screensaverBounces;
  deckLenRef.current = deck.length;

  let body: React.ReactNode;
  try {
    body = deck.length > 0 ? deck[slideNum % deck.length] : idleSlide;
  } catch (err) {
    console.warn('tv: render failed, showing idle card', err);
    body = idleSlide;
  }

  return (
    <div className={styles.viewport}>
      <div
        className={styles.stage}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {screensaverBounces ? (
          // Screensaver owns the whole stage — no header; the image bounces off
          // the title-safe edges (bounceArea carries the insets).
          <BounceLayer items={bounceItems} imgOk={imgOk} />
        ) : (
          <div className={styles.safe}>
            <div className={styles.head}>
              <span className={styles.mark}>THE BIRDHAUS</span>
              <span className={styles.clock}>{venue ? fmtClock(venue) : ''}</span>
              <span>{formatDate(headerDateIso())}</span>
            </div>
            <div className={styles.rule} />
            <div className={`${styles.deck} ${fading ? styles.deckSwap : ''}`}>{body}</div>
          </div>
        )}
        {scan && <div className={styles.lines} />}
        {diag && <div className={styles.diag}>{diag}</div>}
      </div>
    </div>
  );
}
