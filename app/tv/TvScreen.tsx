'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
// Two independent display modes share this one component:
//   - LIVE mode: when tonight's show has per-band set times, a status card
//     driven by the venue clock (doors -> up next -> now playing -> changeover
//     -> closing), re-evaluated every second against the clock, no rotation.
//   - ROTATION mode: no show tonight, or a show with no usable set times —
//     the original slide loop (tonight bill, band spotlights, coming-soon).
// Fetching feeds both; neither the clock tick nor the rotation ever fetches.

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

// "HH:MM" (24h, 1-2 digit hour) -> {hh, mm}, or null for anything malformed.
function parseHHMM(value: string | null | undefined): { hh: number; mm: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
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

export default function TvScreen() {
  const [data, setData] = useState<TvData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Simulated venue clock from ?t — fixed, so the operator can park on a state
  // and confirm it renders. null in normal (live-clock) operation.
  const [sim, setSim] = useState<VenueParts | null>(null);
  const [scale, setScale] = useState(1);
  const [scan, setScan] = useState(false);
  const [slideNum, setSlideNum] = useState(0);
  const [fading, setFading] = useState(false);
  // url -> preload outcome; an image only renders once its url maps to true
  const [imgOk, setImgOk] = useState<Record<string, boolean>>({});
  const preloadStarted = useRef<Set<string>>(new Set());

  const slides = buildSlides(data);
  const slidesLen = useRef(slides.length);
  slidesLen.current = slides.length;

  // Live vs rotation is decided in render below; the rotation interval reads
  // this ref so it can idle (no state churn) while a live show is on screen.
  const liveActiveRef = useRef(false);

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
      if (liveActiveRef.current || slidesLen.current < 2) return;
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

  let body: React.ReactNode;
  try {
    if (live && tonight && venue) {
      const nowSlot = slotOf(venue.hh, venue.mm, venue.ss);
      const doorsSlot = slotOfLabel(tonight.doorsTime);
      body = renderLive(computeLiveState(nowSlot, doorsSlot, sets), tonight);
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
        <div className={styles.safe}>
          <div className={styles.head}>
            <span className={styles.mark}>THE BIRDHAUS</span>
            <span className={styles.clock}>{venue ? fmtClock(venue) : ''}</span>
            <span>{formatDate(headerDateIso())}</span>
          </div>
          <div className={styles.rule} />
          <div className={`${styles.deck} ${fading ? styles.deckSwap : ''}`}>{body}</div>
        </div>
        {scan && <div className={styles.lines} />}
      </div>
    </div>
  );
}
