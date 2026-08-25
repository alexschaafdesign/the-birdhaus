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

const POLL_MS = 60_000; // re-fetch /api/tv
const DWELL_MS = 8_000; // per-slide hold
const FADE_MS = 600; // matches .deck's opacity transition

interface TvBand {
  name: string;
  photo: string | null;
  instagram: string | null;
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
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

function fmtClock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  const pull = useCallback(async () => {
    try {
      // ?date=YYYY-MM-DD on the page previews that day as "tonight" —
      // forwarded to the API, which resolves the real date when absent.
      const preview = new URLSearchParams(window.location.search).get('date');
      const qs = preview && /^\d{4}-\d{2}-\d{2}$/.test(preview) ? `?date=${preview}` : '';
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
  // after mount so server and first client render agree
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    setScan(new URLSearchParams(window.location.search).has('scanlines'));
    const fit = () =>
      setScale(Math.min(window.innerWidth / 640, window.innerHeight / 480));
    fit();
    window.addEventListener('resize', fit);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', fit);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (slidesLen.current < 2) return;
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
    if (!now) return '';
    // en-CA gives YYYY-MM-DD; device clock is the venue clock on the Pi
    return now.toLocaleDateString('en-CA');
  }

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

  const current = slides[slideNum % slides.length];
  let body: React.ReactNode;
  try {
    body = renderSlide(current);
  } catch (err) {
    // Belt and suspenders: one bad slide must not blank a live show.
    console.warn('tv: slide render failed, showing idle card', err);
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
            <span className={styles.clock}>{now ? fmtClock(now) : ''}</span>
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
