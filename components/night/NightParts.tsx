import Link from 'next/link';
import type { ReactNode } from 'react';
import { broadcastDate, to24h } from '@/lib/catalogue';
import type { Night } from '@/lib/archive';
import { NavLink } from '@/components/ui/NavLink';
import { ButtonArrow, buttonClassName } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SeriesTick } from '@/components/ui/SeriesTick';

// The pieces of /shows/[id] (app/shows/[id]/page.tsx). The header is the same
// in every state — ID, date, lineup — which is what makes a night read as one
// page from announcement through archive; everything under it depends on the
// state (lib/nights.ts).

export function NightHeader({
  id,
  tick,
  tag,
  date,
  endDate,
  lineup,
  back,
  flag,
}: {
  id: string;
  tick: 'bh' | 'fc' | 'song-club';
  /** "FC 010" on Fresh Cuts nights. */
  tag?: string | null;
  date: string;
  endDate?: string;
  lineup: string;
  back: { href: string; label: string };
  /** Admin-only marker, e.g. "UNANNOUNCED". */
  flag?: string | null;
}) {
  return (
    <header className="flex flex-col gap-4">
      <NavLink href={back.href} className="w-fit">
        ← {back.label}
      </NavLink>
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-center gap-2.5">
          <SeriesTick series={tick} />
          <span className="text-header-1 text-accent-red leading-none font-bold">{id}</span>
          {tag && <span className="text-header-3 leading-none">· {tag}</span>}
          {flag && (
            <span className="border-surface-ink text-data-overline-11 border-2 px-2 py-0.5 font-bold tracking-[--spacing(0.625)]">
              {flag}
            </span>
          )}
        </h1>
        <p className="text-timecode leading-[1.2] tracking-[--spacing(0.125)]">
          <time dateTime={date}>
            {endDate ? `${broadcastDate(date)} – ${broadcastDate(endDate)}` : broadcastDate(date)}
          </time>
        </p>
      </div>
      {lineup && <p className="text-header-3 max-w-4xl leading-[1.15] uppercase">{lineup}</p>}
    </header>
  );
}

export type LineupAct = {
  name: string;
  slug?: string;
  /** Raw stored set start ("8:30pm"); shown 24h. */
  setStart?: string;
  bio?: string;
};

// The bill with set times. `big` is the Tonight treatment: times lead, large.
export function Lineup({ acts, big = false }: { acts: LineupAct[]; big?: boolean }) {
  if (acts.length === 0) return null;
  return (
    <ol className="flex flex-col">
      {acts.map((act, i) => {
        const time = to24h(act.setStart);
        const name = act.slug ? (
          <Link
            href={`/bands/${act.slug}`}
            className="ui-hover:text-accent-red focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {act.name}
          </Link>
        ) : (
          act.name
        );
        return (
          <li
            key={`${act.name}-${i}`}
            className="border-surface-ink/30 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t py-4 first:border-t-0 sm:flex-nowrap"
          >
            <span
              className={`${big ? 'text-data-set-time-20 w-16' : 'text-timecode w-14'} text-accent-red shrink-0 tabular-nums`}
            >
              {time}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={`${big ? 'text-display-2 leading-[0.9]' : 'text-header-4 leading-[1.2]'} break-words uppercase`}
              >
                {name}
              </span>
              {act.bio && !big && (
                <p className="text-body-3 line-clamp-3 max-w-3xl leading-normal whitespace-pre-line opacity-80">
                  {act.bio}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// "DOORS 19:00 · MUSIC 20:00" — only the parts that are known.
export function DoorDetails({ doorsTime, showTime }: { doorsTime?: string; showTime?: string }) {
  const parts = [
    doorsTime && `DOORS ${to24h(doorsTime)}`,
    showTime && `MUSIC ${to24h(showTime)}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="text-data-caption-13-bold text-accent-red leading-[1.4] font-bold tracking-[--spacing(0.375)]">
      {parts.join(' · ')}
    </p>
  );
}

export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-surface-ink flex flex-col gap-3 border-2 p-4 sm:p-6">
      <SectionHeader label={label} rule="none" />
      {children}
    </section>
  );
}

// Cancelled / postponed: takes the place of tickets and RSVP.
export function StatusNotice({
  status,
  newDate,
}: {
  status: 'cancelled' | 'postponed';
  /** The replacement show, when it's public. */
  newDate?: { id: string; date: string } | null;
}) {
  return (
    <section
      role="status"
      className="bg-surface-ink text-surface-paper -mx-4 flex flex-col gap-4 px-4 py-8 sm:-mx-8 sm:px-8"
    >
      <p className="text-data-overline-11 text-accent-brick font-bold tracking-[--spacing(0.625)] uppercase">
        {status === 'cancelled' ? 'Cancelled' : 'Postponed'}
      </p>
      <p className="text-header-3 max-w-3xl leading-[1.15] uppercase">
        {status === 'cancelled'
          ? 'This show is cancelled.'
          : newDate
            ? `This show moved to ${broadcastDate(newDate.date)}.`
            : 'This show is postponed. New date to be announced.'}
      </p>
      <p className="text-body-3 max-w-2xl leading-normal opacity-80">
        Bought a ticket? We&apos;ll be in touch. Questions:{' '}
        <Link href="/contact" className="underline">
          contact us
        </Link>
        .
      </p>
      {status === 'postponed' && newDate && (
        <Link
          href={`/shows/${newDate.id}`}
          className={`${buttonClassName('primary')} bg-surface-paper text-surface-ink w-fit`}
        >
          {newDate.id}
          <ButtonArrow />
        </Link>
      )}
    </section>
  );
}

function Credit({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
        {label}
      </dt>
      <dd className="text-body-3 leading-normal">{value}</dd>
    </div>
  );
}

// Credits + releases, on paper. Renders nothing when nothing is known.
export function NightCredits({ night }: { night: Night }) {
  const { credits } = night;
  if (!(credits.sound || credits.cameras || credits.channels || credits.photos || night.releases?.length)) {
    return null;
  }
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader label="Credits" />
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <Credit label="Sound" value={credits.sound} />
        <Credit label="Camera ops" value={credits.cameras?.join(', ')} />
        <Credit label="Recorded" value={credits.channels ? `${credits.channels} channels` : undefined} />
        <Credit label="Photos" value={credits.photos?.join(', ')} />
      </dl>
      {night.releases?.length ? (
        <ul className="flex flex-col gap-2">
          {night.releases.map((r) => (
            <li key={r.id}>
              <a
                href={r.url}
                className="text-ui-nav-item-14 ui-hover:text-accent-red focus-visible:outline-accent-red flex items-center gap-2.5 leading-[1.3] tracking-[--spacing(0.25)] uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <SeriesTick series={r.id.startsWith('BHR') ? 'tape' : 'video'} />
                <span className="text-data-caption-13-bold text-accent-red font-bold">{r.id}</span>
                <span className="min-w-0 truncate">{r.title}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// "3 SETS · 2 CAMERAS · 18 CH · 40 PHOTOS" — what the archived night holds.
export function countLine(night: Night, photos: number): string {
  const sets = night.sets.length;
  // Camera count is its own fact (a locked-off camera has no operator); fall
  // back to the number of credited operators when it isn't recorded.
  const cameras = night.credits.cameraCount ?? night.credits.cameras?.length ?? 0;
  return [
    sets > 0 && `${sets} ${sets === 1 ? 'SET' : 'SETS'}`,
    cameras > 0 && `${cameras} ${cameras === 1 ? 'CAMERA' : 'CAMERAS'}`,
    night.credits.channels && `${night.credits.channels} CH`,
    photos > 0 && `${photos} PHOTOS`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Older / newer archive nights.
export function PrevNext({ prev, next }: { prev: Night | null; next: Night | null }) {
  return (
    <nav aria-label="Other nights" className="border-surface-ink flex justify-between gap-4 border-t-2 pt-4">
      {prev ? (
        <NavLink href={`/shows/${prev.id}`} className="flex items-center gap-2" aria-label={`Older night, ${prev.id}`}>
          <span className="inline-flex rotate-180">
            <ButtonArrow size="s" />
          </span>
          {prev.id}
        </NavLink>
      ) : (
        <span />
      )}
      {next && (
        <NavLink href={`/shows/${next.id}`} className="flex items-center gap-2" aria-label={`Newer night, ${next.id}`}>
          {next.id}
          <ButtonArrow size="s" />
        </NavLink>
      )}
    </nav>
  );
}

// The show's own write-up (description + markdown body), any state.
export function NightNotes({ description, html }: { description?: string; html?: string }) {
  if (!description && !html) return null;
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      {description && <p className="text-body-2 leading-normal whitespace-pre-line">{description}</p>}
      {html && (
        <div
          className="text-body-3 leading-normal [&_a]:underline [&_p]:mb-3"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}
