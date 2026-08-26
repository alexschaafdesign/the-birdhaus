'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './tv.module.css';

// The in-venue CRT slide loop. Runs unattended on a Raspberry Pi for a whole
// show night, so the operating rules are stricter than a normal page:
//   - never blank: hold the last good payload when a fetch fails
//   - never throw out of render: malformed fields degrade to blanks, and the
//     slide body is wrapped in a try/catch that falls back to the idle card
//   - never show a broken image: images render only after a successful
//     preload; a 404'd flyer just means that slide runs copy-only
//   - cheap: DOM text + a couple of pre-decoded images, no heavy JS
//
// Three display modes share this one component:
//   - LIVE mode: when tonight's show has per-band set times, a status card
//     driven by the venue clock (doors -> up next -> now playing -> changeover
//     -> closing), re-evaluated every second against the clock, no rotation.
//   - ROTATION mode: no show tonight, or a show with no usable set times —
//     the original slide loop (tonight bill, band spotlights, coming-soon).
//   - BOUNCE mode (opt-in via ?bounce, off by default so the current kiosk
//     URL is untouched): idle DVD-screensaver. With ?bounce=auto it engages
//     when nothing is happening — before doors (live `doors` state, or
//     rotation nights before doorsTime), after the last set (`closing`), or
//     on no-show days — and show flyers drift and bounce inside the safe
//     area, no header. Any info state wins over it. ?bounce=1 forces it on
//     regardless of state, for tube testing.
// Fetching feeds all three; neither the clock tick, the rotation, nor the
// bounce loop ever fetches.

const POLL_MS = 60_000; // re-fetch /api/tv
const DWELL_MS = 8_000; // per-slide hold (rotation mode)
const FADE_MS = 600; // matches .deck's opacity transition

// The venue day runs until 04:00: a time before 04:00 belongs to the previous
// calendar day's show (a 12:15am set is still "tonight"). All schedule math is
// done in "minutes since 04:00", so evening and after-midnight times sort into
// one monotonic line.
const DAY_START_MIN = 4 * 60;
const VENUE_TZ = 'America/Chicago';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// One formatter, reused every tick — constructing it is the costly part, and
// its zone never changes. `.formatToParts` on the real instant is cheap.
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

interface TvBand {
  name: string;
  photo: string | null;
  instagram: string | null;
  // Optional per-band set schedule, "HH:MM" 24h venue-local. null on most
  // nights; partial (some bands set, others null) is expected and degrades.
  setStart: string | null;
  setEnd: string | null;
}

interface TvTonight {
  title: string;
  date: string;
  flyer: string | null;
  doorsTime: string | null;
  showTime: string | null;
  bands: TvBand[];
}

interface TvUpcoming {
  title: string;
  date: string;
  flyer: string | null;
  bands: string[];
}

interface TvData {
  date: string;
  tonight: TvTonight | null;
  upcoming: TvUpcoming[];
}

type Slide =
  | { kind: 'tonight'; show: TvTonight }
  | { kind: 'band'; band: TvBand }
  | { kind: 'upcoming'; show: TvUpcoming }
  | { kind: 'idle' };

// Venue wall-clock, broken into fields. For a real instant we read it in
// Chicago via Intl (so a UTC-clocked box still resolves the right local time);
// for a simulated ?t we take the literal fields as-is.
interface VenueParts {
  y: number;
  mo: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

// A parsed set: `start`/`end` are minutes-since-04:00 for ordering, `*Label`
// are the pretty forms shown on the tube.
interface LiveSet {
  name: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
}

type LiveState =
  | { kind: 'doors' }
  | { kind: 'upnext'; set: LiveSet }
  | { kind: 'now'; set: LiveSet }
  | { kind: 'changeover'; set: LiveSet }
  | { kind: 'closing' };

// Loose shape check before swapping in a payload — a half-broken response
// keeps the previous good data instead of poisoning the loop.
function isTvData(body: unknown): body is TvData {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    (b.tonight === null || typeof b.tonight === 'object') && Array.isArray(b.upcoming)
  );
}

// "2026-08-29" -> "SAT AUG 29". Parsed by hand so the string stays a plain
// calendar date — new Date("2026-08-29") would reinterpret it through UTC.
function formatDate(iso: string | null | undefined): string {
  if (!iso || !ISO_DATE.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

// Time-of-day string -> {hh, mm} (24h), or null for anything malformed.
// Set times arrive as 24h "HH:MM", but doorsTime is stored freeform 12h in
// the DB ("7:00pm", "7:00 pm", "6:30pm") — accept both, plus bare "7pm".
// A bare number with no colon and no am/pm stays rejected as ambiguous.
function parseHHMM(value: string | null | undefined): { hh: number; mm: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());
  if (!m || (!m[2] && !m[3])) return null;
  let hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (mm > 59) return null;
  if (ap) {
    if (hh < 1 || hh > 12) return null;
    if (ap === 'pm' && hh !== 12) hh += 12;
    else if (ap === 'am' && hh === 12) hh = 0;
  } else if (hh > 23) {
    return null;
  }
  return { hh, mm };
}

// "20:15" -> "8:15 PM"; "00:15" -> "12:15 AM". AM/PM matters here because a
// late set legitimately crosses midnight.
function fmt12(value: string | null | undefined): string {
  const p = parseHHMM(value);
  if (!p) return '';
  const ap = p.hh < 12 ? 'AM' : 'PM';
  const h = p.hh % 12 || 12;
  return `${h}:${String(p.mm).padStart(2, '0')} ${ap}`;
}

// Minutes since 04:00, folding sub-04:00 times up onto the same night so
// evening and after-midnight sets order correctly. Seconds keep the "now"
// reading smooth so state flips land on the right instant.
function slotOf(hh: number, mm: number, ss = 0): number {
  let mins = hh * 60 + mm + ss / 60;
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return mins - DAY_START_MIN;
}

function slotOfLabel(value: string | null | undefined): number | null {
  const p = parseHHMM(value);
  return p ? slotOf(p.hh, p.mm) : null;
}

// Read the real instant as Chicago wall-clock fields.
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

// "2026-09-05T20:15" -> its venue fields. Interpreted literally as venue-local
// (the ?t operator is thinking in the tube's clock, not the browser's zone).
function parseT(value: string | null): VenueParts | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  return { y, mo, d, hh, mm, ss: 0 };
}

// YYYY-MM-DD for the venue "day" these parts fall in (before 04:00 rolls back
// to the previous calendar day). UTC math so no local zone sneaks in.
function venueDateIso(v: VenueParts): string {
  let dt = new Date(Date.UTC(v.y, v.mo - 1, v.d));
  if (v.hh < DAY_START_MIN / 60) dt = new Date(dt.getTime() - 86_400_000);
  return dt.toISOString().slice(0, 10);
}

function fmtClock(v: VenueParts): string {
  const h = v.hh % 12 || 12;
  return `${h}:${String(v.mm).padStart(2, '0')}`;
}

// Accepts a bare handle, "@handle", or a full instagram.com URL.
function igHandle(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\/+$/, '');
  const last = trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed;
  if (!last) return '';
  return last.startsWith('@') ? last : `@${last}`;
}

// Headline size steps down for long names so nothing wraps off the tube.
// `narrow` = the copy sits beside an image (~300px column instead of full
// width), so it can only fit ~11 mono chars per line at the biggest size —
// step down sooner, keyed on the longest unbreakable word so a single long
// name doesn't hyphen-break mid-word.
function bigClass(text: string, narrow = false): string {
  const longestWord = text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  const [xlongAt, longAt] = narrow ? [18, 10] : [26, 16];
  if (text.length > xlongAt || (narrow && longestWord > 15)) {
    return `${styles.big} ${styles.bigXlong}`;
  }
  if (text.length > longAt || longestWord > longAt) return `${styles.big} ${styles.bigLong}`;
  return styles.big;
}

// Tonight's bands -> ordered, validated set list. Only bands with a parseable
// start AND end where end is after start survive; everything else drops out,
// so partial or malformed schedules just thin the list rather than break it.
function buildSets(tonight: TvTonight | null): LiveSet[] {
  if (!tonight || !Array.isArray(tonight.bands)) return [];
  const sets: LiveSet[] = [];
  for (const band of tonight.bands) {
    if (!band || typeof band.name !== 'string' || !band.name) continue;
    const start = slotOfLabel(band.setStart);
    const end = slotOfLabel(band.setEnd);
    if (start === null || end === null || end <= start) continue;
    sets.push({
      name: band.name,
      start,
      end,
      startLabel: fmt12(band.setStart),
      endLabel: fmt12(band.setEnd),
    });
  }
  return sets.sort((a, b) => a.start - b.start);
}

// Which live state the clock puts us in. Assumes `sets` is non-empty (the
// caller only enters live mode when at least one set parsed).
function computeLiveState(
  nowSlot: number,
  doorsSlot: number | null,
  sets: LiveSet[]
): LiveState {
  const current = sets.find((s) => nowSlot >= s.start && nowSlot < s.end);
  if (current) return { kind: 'now', set: current };

  const first = sets[0];
  if (nowSlot < first.start) {
    if (doorsSlot !== null && nowSlot < doorsSlot) return { kind: 'doors' };
    return { kind: 'upnext', set: first };
  }

  // Past the first set's start, but not inside any set: either a gap before a
  // later set (changeover) or past the final set (closing).
  const next = sets.find((s) => s.start > nowSlot);
  if (next) return { kind: 'changeover', set: next };
  return { kind: 'closing' };
}

function buildSlides(data: TvData | null): Slide[] {
  const slides: Slide[] = [];
  const tonight = data?.tonight ?? null;
  if (tonight) {
    slides.push({ kind: 'tonight', show: tonight });
    for (const band of Array.isArray(tonight.bands) ? tonight.bands : []) {
      if (band && typeof band.name === 'string' && band.name) {
        slides.push({ kind: 'band', band });
      }
    }
  }
  // Upcoming slides are just the flyer (it already carries date + lineup),
  // so a show without one has nothing to put on screen — skip it.
  for (const show of Array.isArray(data?.upcoming) ? data.upcoming : []) {
    if (show && show.flyer) slides.push({ kind: 'upcoming', show });
  }
  if (slides.length === 0) slides.push({ kind: 'idle' });
  return slides;
}

// ---- bounce mode tuning ---------------------------------------------------
// Every knob for the screensaver lives here — expect to adjust size and speed
// against the actual tube.
// Flyer box, px. 80% of the Coming Soon slide's flyer (deck height ≈340px);
// the safe area is 576x428, so this leaves ~150px of vertical travel.
const BOUNCE_MAX_W = 384;
const BOUNCE_MAX_H = 272;
// Seconds for one edge-to-edge crossing, per axis. Vertical is slower (steep
// vertical motion shimmers on the interlaced tube) and a non-multiple of
// horizontal so the path never locks into a corner-to-corner loop.
const BOUNCE_X_SECONDS = 10;
const BOUNCE_Y_SECONDS = 34;

// What bounces: one entry per show, tonight first, then upcoming in date
// order. A show with no flyer still gets an entry — it renders as a text card.
interface BounceItem {
  title: string;
  date: string;
  flyer: string | null;
}

function buildBounceItems(data: TvData | null): BounceItem[] {
  const items: BounceItem[] = [];
  const shows: Array<{ title?: unknown; date?: unknown; flyer?: unknown } | null> = [
    data?.tonight ?? null,
    ...(Array.isArray(data?.upcoming) ? data.upcoming : []),
  ];
  for (const show of shows) {
    if (!show || typeof show !== 'object') continue;
    items.push({
      title: typeof show.title === 'string' ? show.title : '',
      date: typeof show.date === 'string' ? show.date : '',
      flyer: typeof show.flyer === 'string' ? show.flyer : null,
    });
  }
  // Nothing on the calendar (or no data yet): bounce the house mark.
  if (items.length === 0) items.push({ title: 'THE BIRDHAUS', date: '', flyer: null });
  return items;
}

// The DVD screensaver. One absolutely-positioned box drifting diagonally
// inside the safe area, reflecting off its edges; each edge hit advances to
// the next show. Pi-friendly by construction: position/heading live in a ref
// and the single RAF loop writes translate3d directly, so a 6-hour idle night
// never churns React renders per frame — the only setState is the flyer swap
// on an edge hit (~every few seconds). memo() keeps the parent's once-a-second
// clock tick from re-rendering this subtree.
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
    let raf = 0;
    let last: number | null = null;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      // Delta-time so drift speed is frame-rate independent — if the Pi drops
      // frames the motion slows visually but never jumps (capped at 250ms so
      // a background-tab stall doesn't teleport the box).
      const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.25);
      last = t;
      const area = areaRef.current;
      const el = itemRef.current;
      if (!area || !el) return;
      // Travel = how far the box can move. Re-read every frame because the
      // box changes size when the flyer swaps; transform never dirties
      // layout, so these reads are cached and cheap.
      const travelX = Math.max(0, area.clientWidth - el.offsetWidth);
      const travelY = Math.max(0, area.clientHeight - el.offsetHeight);
      const m = motion.current;
      m.x += m.dx * (travelX / BOUNCE_X_SECONDS) * dt;
      m.y += m.dy * (travelY / BOUNCE_Y_SECONDS) * dt;
      // Reflect only when moving outward: a clamp caused by the next flyer
      // being bigger than the last isn't a bounce and mustn't advance again.
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
      // Subpixel positions on purpose: at these drift speeds (the vertical
      // axis moves ~5px/s) whole-pixel snapping reads as a stutter — the box
      // parks for a dozen frames, then hops. The compositor's bilinear
      // filtering turns subpixel offsets into smooth motion instead.
      el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      if (hit) setIdx((n) => n + 1);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const item = items[idx % items.length];
  const url = item.flyer;
  const flyerReady = !!url && imgOk[url] === true;

  return (
    <div ref={areaRef} className={styles.bounceArea}>
      <div ref={itemRef} className={styles.bounceItem} style={{ maxWidth: BOUNCE_MAX_W }}>
        {flyerReady ? (
          // Just the flyer — it already carries the date and lineup.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.title || 'Show flyer'}
            style={{ maxWidth: BOUNCE_MAX_W, maxHeight: BOUNCE_MAX_H }}
          />
        ) : (
          // No flyer (or its preload failed/hasn't landed): bounce a text
          // card instead — never skip the show, never bounce an empty box.
          <div className={styles.bounceCard}>
            <div className={bigClass(item.title || 'THE BIRDHAUS')}>
              {item.title || 'THE BIRDHAUS'}
            </div>
            {formatDate(item.date) && <div className={styles.sub}>{formatDate(item.date)}</div>}
          </div>
        )}
      </div>
    </div>
  );
});

export default function TvScreen() {
  const [data, setData] = useState<TvData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Simulated venue clock from ?t — fixed, so the operator can park on a state
  // and confirm it renders. null in normal (live-clock) operation.
  const [sim, setSim] = useState<VenueParts | null>(null);
  const [scale, setScale] = useState(1);
  const [scan, setScan] = useState(false);
  // ?bounce=auto engages the screensaver in idle states; ?bounce=1 forces it
  // always-on; absent (the current kiosk URL) = today's behavior, untouched.
  const [bounceMode, setBounceMode] = useState<'off' | 'auto' | 'force'>('off');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [slideNum, setSlideNum] = useState(0);
  const [fading, setFading] = useState(false);
  // url -> preload outcome; an image only renders once its url maps to true
  const [imgOk, setImgOk] = useState<Record<string, boolean>>({});
  const preloadStarted = useRef<Set<string>>(new Set());

  const slides = buildSlides(data);
  const slidesLen = useRef(slides.length);
  slidesLen.current = slides.length;

  // Live vs rotation vs bounce is decided in render below; the rotation
  // interval reads these refs so it can idle (no state churn) while a live
  // show or the bounce screensaver owns the screen.
  const liveActiveRef = useRef(false);
  const bounceActiveRef = useRef(false);

  const pull = useCallback(async () => {
    try {
      // ?t=YYYY-MM-DDThh:mm (preferred) or ?date=YYYY-MM-DD previews a given
      // day as "tonight". ?t also drives the simulated clock; here we only need
      // its date half so the API returns that night's show. Absent -> real day.
      const params = new URLSearchParams(window.location.search);
      const explicit = params.get('date');
      const t = parseT(params.get('t'));
      let qsDate: string | null = null;
      if (explicit && ISO_DATE.test(explicit)) qsDate = explicit;
      else if (t) qsDate = venueDateIso(t);
      const qs = qsDate ? `?date=${qsDate}` : '';
      const res = await fetch(`/api/tv${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body: unknown = await res.json();
      if (isTvData(body)) setData(body);
    } catch (err) {
      // A dead network mid-show is not a reason to clear the screen.
      console.warn('tv: fetch failed, holding last data', err);
    }
  }, []);

  useEffect(() => {
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => clearInterval(id);
  }, [pull]);

  // clock + scanline flag + stage scaling are all client-only state, set
  // after mount so server and first client render agree. With ?t the clock is
  // a fixed simulated instant (no interval); otherwise it ticks once a second.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScan(params.has('scanlines'));
    const bounceParam = params.get('bounce');
    if (bounceParam === '1') setBounceMode('force');
    else if (bounceParam === 'auto') setBounceMode('auto');
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fit = () =>
      setScale(Math.min(window.innerWidth / 640, window.innerHeight / 480));
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

  // Rotation ticks only in rotation mode; while a live show owns the screen it
  // idles so it neither advances an unseen index nor churns re-renders.
  useEffect(() => {
    const id = setInterval(() => {
      if (liveActiveRef.current || bounceActiveRef.current || slidesLen.current < 2) return;
      setFading(true);
      setTimeout(() => {
        setSlideNum((n) => n + 1);
        setFading(false);
      }, FADE_MS);
    }, DWELL_MS);
    return () => clearInterval(id);
  }, []);

  // Decode every image off-screen once; slides consult the outcome and a
  // failed or still-loading image just leaves its slide copy-only.
  useEffect(() => {
    const urls: string[] = [];
    if (data?.tonight?.flyer) urls.push(data.tonight.flyer);
    for (const band of data?.tonight?.bands ?? []) {
      if (band?.photo) urls.push(band.photo);
    }
    for (const show of data?.upcoming ?? []) {
      if (show?.flyer) urls.push(show.flyer);
    }
    for (const url of urls) {
      if (typeof url !== 'string' || preloadStarted.current.has(url)) continue;
      preloadStarted.current.add(url);
      const img = new window.Image();
      img.onload = () => setImgOk((prev) => ({ ...prev, [url]: true }));
      img.onerror = () => setImgOk((prev) => ({ ...prev, [url]: false }));
      img.src = url;
    }
  }, [data]);

  const art = (url: string | null, alt: string) =>
    url && imgOk[url] === true ? (
      <div className={styles.art}>
        {/* Fixed 640px stage on a kiosk: Cloudinary already serves resized
            files and next/image's responsive machinery has nothing to add. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} />
      </div>
    ) : null;

  const lineup = (names: string[]) => (
    <div className={styles.lineup}>
      {names.filter((n) => typeof n === 'string' && n).map((name, i) => (
        <div key={i} className={styles.lineupRow}>
          {name}
        </div>
      ))}
    </div>
  );

  // Venue wall-clock for this render: simulated fields, or the ticking instant
  // read in Chicago. null only in the pre-mount frame.
  const venue: VenueParts | null = sim ?? (now ? venuePartsOf(now) : null);

  const idleSlide = (
    <div className={styles.slide}>
      <div className={`${styles.copy} ${styles.copyCentered}`}>
        <div className={styles.big}>THE BIRDHAUS</div>
        <div className={styles.sub}>{data ? 'No show tonight' : formatDate(headerDateIso())}</div>
      </div>
    </div>
  );

  function headerDateIso(): string {
    if (data?.date) return data.date;
    if (!venue) return '';
    return venueDateIso(venue);
  }

  // ---- live (clock-driven) card ------------------------------------------
  function renderLive(state: LiveState, tonight: TvTonight): React.ReactNode {
    const title = typeof tonight.title === 'string' ? tonight.title : '';
    switch (state.kind) {
      case 'doors': {
        const doorsLabel = fmt12(tonight.doorsTime);
        return (
          <div className={styles.slide}>
            <div className={`${styles.copy} ${styles.copyCentered}`}>
              <div className={styles.eyebrow}>
                <span className={styles.dot} />
                <span>TONIGHT</span>
              </div>
              {title && <div className={bigClass(title)}>{title}</div>}
              {doorsLabel && <div className={styles.sub}>DOORS {doorsLabel}</div>}
            </div>
          </div>
        );
      }
      case 'upnext':
        return (
          <div className={styles.slide}>
            <div className={`${styles.copy} ${styles.copyCentered}`}>
              <div className={styles.eyebrow}>UP NEXT</div>
              <div className={bigClass(state.set.name)}>{state.set.name}</div>
              {state.set.startLabel && (
                <div className={styles.sub}>STARTS {state.set.startLabel}</div>
              )}
            </div>
          </div>
        );
      case 'now':
        return (
          <div className={styles.slide}>
            <div className={`${styles.copy} ${styles.copyCentered}`}>
              <div className={styles.eyebrow}>
                <span className={styles.dot} />
                <span>NOW PLAYING</span>
              </div>
              <div className={bigClass(state.set.name)}>{state.set.name}</div>
              {state.set.endLabel && (
                <div className={styles.sub}>UNTIL {state.set.endLabel}</div>
              )}
            </div>
          </div>
        );
      case 'changeover':
        return (
          <div className={styles.slide}>
            <div className={`${styles.copy} ${styles.copyCentered}`}>
              <div className={styles.eyebrow}>CHANGEOVER · UP NEXT</div>
              <div className={bigClass(state.set.name)}>{state.set.name}</div>
              {state.set.startLabel && (
                <div className={styles.sub}>STARTS {state.set.startLabel}</div>
              )}
            </div>
          </div>
        );
      case 'closing':
        return (
          <div className={styles.slide}>
            <div className={`${styles.copy} ${styles.copyCentered}`}>
              <div className={styles.eyebrow}>THAT’S A WRAP</div>
              <div className={styles.big}>GOODNIGHT</div>
              {title && <div className={styles.sub}>{title}</div>}
            </div>
          </div>
        );
    }
  }

  // ---- rotation slide ----------------------------------------------------
  function renderSlide(slide: Slide) {
    switch (slide.kind) {
      case 'tonight': {
        const bandNames = (Array.isArray(slide.show.bands) ? slide.show.bands : [])
          .map((b) => (b && typeof b.name === 'string' ? b.name : ''))
          .filter(Boolean);
        const doors = typeof slide.show.doorsTime === 'string' ? slide.show.doorsTime : '';
        const music = typeof slide.show.showTime === 'string' ? slide.show.showTime : '';
        const times = [doors && `DOORS ${doors}`, music && `MUSIC ${music}`]
          .filter(Boolean)
          .join(' · ');
        const flyerArt = art(slide.show.flyer, 'Tonight’s flyer');
        return (
          <div className={styles.slide}>
            {flyerArt}
            <div className={styles.copy}>
              <div className={styles.eyebrow}>
                <span className={styles.dot} />
                <span>TONIGHT</span>
              </div>
              {bandNames.length > 0
                ? lineup(bandNames)
                : slide.show.title && (
                    <div className={bigClass(slide.show.title, !!flyerArt)}>
                      {slide.show.title}
                    </div>
                  )}
              {times && <div className={styles.times}>{times}</div>}
            </div>
          </div>
        );
      }
      case 'band': {
        const photoArt = art(slide.band.photo, slide.band.name);
        const handle = igHandle(slide.band.instagram);
        return (
          <div className={styles.slide}>
            {photoArt}
            <div className={`${styles.copy} ${photoArt ? '' : styles.copyCentered}`}>
              <div className={styles.eyebrow}>ON THE BILL</div>
              <div className={bigClass(slide.band.name, !!photoArt)}>{slide.band.name}</div>
              {handle && <div className={styles.sub}>{handle}</div>}
            </div>
          </div>
        );
      }
      case 'upcoming': {
        const url = slide.show.flyer;
        return (
          <div className={`${styles.slide} ${styles.slideCol}`}>
            <div className={styles.eyebrow}>COMING SOON</div>
            {url && imgOk[url] === true ? (
              <div className={styles.artCenter}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${slide.show.title || 'Show'} flyer`} />
              </div>
            ) : (
              // flyer 404'd or hasn't decoded yet — name the show rather
              // than holding an empty frame
              <div className={`${styles.copy} ${styles.copyCentered}`}>
                {slide.show.title && (
                  <div className={bigClass(slide.show.title)}>{slide.show.title}</div>
                )}
                {formatDate(slide.show.date) && (
                  <div className={styles.sub}>{formatDate(slide.show.date)}</div>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'idle':
        return idleSlide;
    }
  }

  // Live mode owns the screen whenever tonight's show carries at least one
  // usable set AND we have a clock to read; otherwise fall back to rotation.
  // `sets` empty (no/partial-unusable times) drops straight through to the
  // existing loop — the graceful fallback the spec requires.
  const tonight = data?.tonight ?? null;
  const sets = buildSets(tonight);
  const live = !!tonight && sets.length > 0 && venue !== null;
  liveActiveRef.current = live;

  const nowSlot = venue ? slotOf(venue.hh, venue.mm, venue.ss) : null;
  const liveState: LiveState | null =
    live && tonight && nowSlot !== null
      ? computeLiveState(nowSlot, slotOfLabel(tonight.doorsTime), sets)
      : null;

  // Idle detection for ?bounce=auto: the screensaver runs only when there's
  // nothing to read — before doors, after the last set, or no show tonight.
  // On rotation nights (no set times) "before doors" comes straight from
  // doorsTime vs the clock; with no doorsTime either, there's no idle signal
  // and the night stays in rotation.
  let bounce = bounceMode === 'force';
  if (!bounce && bounceMode === 'auto' && !reduceMotion && data && nowSlot !== null) {
    if (liveState) {
      bounce = liveState.kind === 'doors' || liveState.kind === 'closing';
    } else if (!tonight) {
      bounce = true;
    } else {
      const doorsSlot = slotOfLabel(tonight.doorsTime);
      bounce = doorsSlot !== null && nowSlot < doorsSlot;
    }
  }
  bounceActiveRef.current = bounce;
  const bounceItems = useMemo(() => buildBounceItems(data), [data]);

  let body: React.ReactNode;
  try {
    if (liveState && tonight) {
      body = renderLive(liveState, tonight);
    } else {
      body = renderSlide(slides[slideNum % slides.length]);
    }
  } catch (err) {
    // Belt and suspenders: one bad slide/state must not blank a live show.
    console.warn('tv: render failed, showing idle card', err);
    body = idleSlide;
  }

  return (
    <div className={styles.viewport}>
      <div
        className={styles.stage}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {bounce ? (
          // Screensaver owns the whole stage — no header, no rule; the flyer
          // bounces off the title-safe edges (bounceArea carries the insets).
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
      </div>
    </div>
  );
}
