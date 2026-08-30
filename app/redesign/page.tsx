import Link from 'next/link';
import { getAllShows, getTodayCentral } from '@/lib/shows';
import type { Show } from '@/lib/shows';
import {
  fullCatalogue,
  broadcastDate,
  shortDate,
  to24h,
  bandNames,
  isFreshCuts,
  freshCutsTag,
} from '@/lib/catalogue';
import DiscoBall from '@/components/broadcast/DiscoBall';
import FreshCutsDisc from '@/components/broadcast/FreshCutsDisc';
import SmpteBar from '@/components/broadcast/SmpteBar';
import {
  Scanlines,
  Washes,
  RegistrationMarks,
  TrackingNoise,
} from '@/components/broadcast/Texture';

// Evaluate the upcoming/past split per request so the "next show" reflects the
// current date, not the last deploy — same as the live homepage.
export const dynamic = 'force-dynamic';

export default async function RedesignHome() {
  const shows = await getAllShows();
  const today = getTodayCentral();

  const upcoming = shows
    .filter((s) => s.date >= today && s.announced === true)
    .sort((a, b) => a.date.localeCompare(b.date));

  const next = upcoming[0] ?? null;
  const rest = upcoming.slice(1, 7);
  const nextFreshCuts = upcoming.find((s) => isFreshCuts(s.slug)) ?? null;

  return (
    <div className="broadcast-root">
      <Washes />
      <Scanlines />

      {/* ---- HERO: the next show as a broadcast ------------------------- */}
      <section
        className="relative"
        style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', paddingBlock: 'clamp(48px, 7vh, 96px)' }}
      >
        <RegistrationMarks />
        {next ? (
          <HeroShow show={next} />
        ) : (
          <div className="bx-wrap bx-osd" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
            <p className="bx-red">▌ NO SIGNAL</p>
            <p style={{ marginTop: 12 }}>No shows on the books right now. Check back soon.</p>
          </div>
        )}
      </section>

      {/* ---- UPCOMING: schedule readout -------------------------------- */}
      {rest.length > 0 && (
        <section className="bx-wrap" style={{ paddingBlock: 'clamp(40px, 6vh, 80px)' }}>
          <h2 className="bx-sectlabel" style={{ marginBottom: 24 }}>
            <span className="bx-red">▷</span> UPCOMING TRANSMISSIONS
            <span className="bx-osd--dim" style={{ letterSpacing: '0.05em' }}>
              {rest.length} CUED
            </span>
          </h2>
          <div>
            {rest.map((s) => (
              <ScheduleRow key={s.slug} show={s} />
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <Link href="/archive" className="bx-osd bx-red" style={{ letterSpacing: '0.08em' }}>
              FULL ARCHIVE →
            </Link>
          </div>
        </section>
      )}

      {/* ---- FRESH CUTS ------------------------------------------------- */}
      <section style={{ background: 'var(--bx-paper-2)', paddingBlock: 'clamp(40px, 6vh, 80px)' }}>
        <div
          className="bx-wrap"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(24px, 5vw, 56px)', alignItems: 'center' }}
        >
          <FreshCutsDisc tag={nextFreshCuts ? freshCutsTag(nextFreshCuts.slug) ?? undefined : undefined} />
          <div style={{ flex: '1 1 300px', minWidth: 260 }}>
            <h2 className="bx-sectlabel" style={{ marginBottom: 12 }}>
              <span className="bx-red">▷</span> FRESH CUTS
            </h2>
            <p className="bx-osd" style={{ maxWidth: '42ch', lineHeight: 1.5 }}>
              A recurring night built for first listens. Short sets, new material
              only — songs played in the basement before they’re played anywhere
              else.
            </p>
            {nextFreshCuts ? (
              <Link
                href={`/shows/${nextFreshCuts.slug}`}
                className="bx-osd"
                style={{ display: 'inline-block', marginTop: 20 }}
              >
                <span className="bx-red">NEXT · {fullCatalogue(nextFreshCuts)}</span>
                <br />
                <span style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)' }}>
                  {bandNames(nextFreshCuts).join(' · ')} →
                </span>
              </Link>
            ) : (
              <Link href="/fresh-cuts" className="bx-osd bx-red" style={{ display: 'inline-block', marginTop: 20, letterSpacing: '0.08em' }}>
                ALL INSTALLMENTS →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---- BASEMENT TAPES / LABEL ------------------------------------ */}
      <section className="bx-wrap" style={{ paddingBlock: 'clamp(40px, 6vh, 80px)' }}>
        <h2 className="bx-sectlabel" style={{ marginBottom: 16 }}>
          <span className="bx-red">●</span> BASEMENT TAPES
        </h2>
        <p className="bx-osd" style={{ maxWidth: '58ch', lineHeight: 1.5 }}>
          Every show is recorded to 18 channels and filmed. Selected nights are
          mixed down and pressed to cassette on Birdhaus Records.
        </p>
        <p className="bx-osd bx-osd--dim" style={{ marginTop: 14, letterSpacing: '0.08em' }}>
          CATALOGUE — BHR-### RELEASES · BT-V# BASEMENT TAPES · BHV-### VIDEO
        </p>
        <a
          href="https://birdhausrecords.bandcamp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bx-osd"
          style={{
            display: 'inline-block',
            marginTop: 24,
            border: '2px solid var(--bx-ink)',
            padding: '10px 18px',
            letterSpacing: '0.08em',
          }}
        >
          → BIRDHAUS RECORDS ON BANDCAMP
        </a>
      </section>

      <SmpteBar />

      {/* ---- ABOUT / THE ROOM ----------------------------------------- */}
      <section className="bx-wrap" style={{ paddingBlock: 'clamp(40px, 6vh, 80px)' }}>
        <p className="bx-chroma" style={{ fontSize: 'clamp(1.6rem, 6vw, 3rem)', lineHeight: 1.05, marginBottom: 20 }}>
          the BIRDHAUS
        </p>
        <p className="bx-osd" style={{ maxWidth: '54ch', lineHeight: 1.55, fontSize: 'clamp(14px, 2vw, 18px)' }}>
          A DIY house venue and record label in Powderhorn, Minneapolis. Roughly
          forty people, donation entry, all ages, four to five shows a month.
          Every night is recorded and filmed — the documentation is the point,
          not a side effect.
        </p>
        <p className="bx-osd bx-osd--dim" style={{ marginTop: 16, letterSpacing: '0.06em' }}>
          LOCATION SHARED ON RSVP · DONATION AT THE DOOR · BRING CASH
        </p>
      </section>

      {/* ---- FOOTER ---------------------------------------------------- */}
      <footer className="bx-wrap" style={{ paddingBlock: 'clamp(32px, 4vh, 56px)' }}>
        <div className="bx-rule" style={{ background: 'rgba(22,21,15,0.5)' }} />
        <nav
          className="bx-osd"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 28px', marginTop: 20, letterSpacing: '0.06em' }}
          aria-label="Footer"
        >
          <Link href="/upcoming">UPCOMING</Link>
          <Link href="/archive">ARCHIVE</Link>
          <Link href="/fresh-cuts">FRESH CUTS</Link>
          <Link href="/song-club">SONG CLUB</Link>
          <Link href="/contact">CONTACT</Link>
          <a href="https://birdhausrecords.bandcamp.com" target="_blank" rel="noopener noreferrer">
            BANDCAMP ↗
          </a>
          <a href="https://twinscene.org" target="_blank" rel="noopener noreferrer">
            TWIN SCENE ↗
          </a>
        </nav>
        <TrackingNoise className="w-full" />
        <p className="bx-osd bx-osd--dim" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, letterSpacing: '0.06em' }}>
          <span>THE BIRDHAUS · MPLS MN · EST. POWDERHORN</span>
          <span>THEBIRDHAUS.ORG</span>
        </p>
      </footer>
    </div>
  );
}

// ---- Hero: the poster chassis, rebuilt for a viewport ------------------

function HeroShow({ show }: { show: Show }) {
  const names = bandNames(show);
  const setTime = to24h(show.showTime);
  const doors = to24h(show.doorsTime);

  return (
    <div className="bx-wrap" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'clamp(28px, 4vh, 48px)' }}>
      {/* Header band */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="bx-osd" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>THE BIRDHAUS · MPLS MN</span>
          <span>{broadcastDate(show.date)}</span>
        </div>
        <div className="bx-rule" />
        <div className="bx-osd bx-red" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, letterSpacing: '0.08em' }}>
          <span>▶ PLAY</span>
          <span>{fullCatalogue(show)}</span>
        </div>
      </div>

      {/* Hero object */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'clamp(24px, 4vh, 44px)' }}>
        <DiscoBall />
      </div>

      {/* Lineup */}
      <div style={{ marginTop: 'auto' }}>
        {setTime && <p className="bx-settime" style={{ marginBottom: 4 }}>{setTime}</p>}
        <Link href={`/shows/${show.slug}`} style={{ display: 'block' }}>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1.4vh, 16px)' }}>
            {names.map((name) => (
              <li key={name} className="bx-name">{name}</li>
            ))}
          </ul>
        </Link>
        <Link href={`/shows/${show.slug}`} className="bx-osd bx-red" style={{ display: 'inline-block', marginTop: 16, letterSpacing: '0.08em' }}>
          ▶ RSVP / DETAILS →
        </Link>
      </div>

      {/* SMPTE strip */}
      <SmpteBar />

      {/* Data band */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="bx-osd" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span>DOORS {doors ?? '20:00'} · ENTRY BY DONATION · ALL AGES</span>
          <span className="bx-osd--dim">THEBIRDHAUS.ORG</span>
        </div>
        <p className="bx-osd bx-osd--dim">
          RECORDED LIVE — 18CH / 24-BIT / 48&nbsp;kHz → BASEMENT TAPES VOL. 1
        </p>
      </div>
    </div>
  );
}

// ---- Compact schedule row ----------------------------------------------

function ScheduleRow({ show }: { show: Show }) {
  const tag = freshCutsTag(show.slug);
  return (
    <Link href={`/shows/${show.slug}`} className="bx-row">
      <span className="bx-osd bx-row__date">{shortDate(show.date)}</span>
      <span className="bx-osd bx-red bx-row__cat">{fullCatalogue(show)}</span>
      <span className="bx-row__name">{bandNames(show).join(' · ')}</span>
      <span className="bx-osd bx-osd--dim bx-row__tag">{tag ? 'FRESH CUTS' : ''}</span>
    </Link>
  );
}
