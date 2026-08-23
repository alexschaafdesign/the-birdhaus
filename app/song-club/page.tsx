import Link from 'next/link';
import type { Metadata } from 'next';
import { listEvents, getTodayCentral, type SongClubEvent } from '@/lib/song-club';

export const metadata: Metadata = {
  title: 'Song Club',
  description: 'Song-a-days, monthly songwriter meetups, and more.',
};

// Reads the DB directly, so opt out of caching to keep the list fresh after edits.
export const dynamic = 'force-dynamic';

// "2026-08-15" -> "Sat, Aug 15, 2026"
function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Events with a flyer get a larger, image-led card (the flyer is the whole
// point of the poster) — text-only events fall back to the compact row.
function EventCard({ event, large = false }: { event: SongClubEvent; large?: boolean }) {
  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;

  if (large && event.flyer_url) {
    return (
      <Link
        href={`/song-club/${event.slug}`}
        className="flex flex-col overflow-hidden border-2 border-ink bg-paper shadow-hard transition hover:-translate-x-0.5 hover:-translate-y-0.5 sm:flex-row"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.flyer_url}
          alt={event.title}
          className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:w-64 sm:shrink-0"
        />
        <div className="flex flex-col justify-center p-5 sm:p-6">
          <div className="font-mono text-xs font-medium uppercase tracking-wide text-vhs-red">
            {formatDate(event.event_date)}
            {timeLine ? ` · ${timeLine}` : ''}
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink">{event.title}</div>
          {event.venue_name && (
            <div className="mt-1 text-sm text-ink/60">{event.venue_name}</div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/song-club/${event.slug}`}
      className="block border-2 border-ink bg-paper p-4 transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard"
    >
      <div className="font-mono text-xs font-medium uppercase tracking-wide text-vhs-red">
        {formatDate(event.event_date)}
        {timeLine ? ` · ${timeLine}` : ''}
      </div>
      <div className="mt-1 text-base font-medium text-ink">{event.title}</div>
      {event.venue_name && (
        <div className="mt-0.5 text-sm text-ink/60">{event.venue_name}</div>
      )}
    </Link>
  );
}

export default async function SongClubPage() {
  const events = await listEvents({ publishedOnly: true });
  const today = getTodayCentral();
  const upcoming = events.filter((e) => e.event_date >= today).reverse(); // soonest first
  const past = events.filter((e) => e.event_date < today); // most recent first

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-6">
        <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
        <h1 className="text-3xl font-semibold text-ink uppercase tracking-tight sm:text-4xl">Song Club</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink/60">
          Song-a-days, monthly songwriter meetups, and more.
        </p>
      </header>

      {events.length === 0 ? (
        <p className="text-sm text-ink/50">No meetups scheduled yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-ink/45">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcoming.map((e, i) => (
                  <EventCard key={e.id} event={e} large={i === 0} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-ink/45">
                Past
              </h2>
              <div className="space-y-3">
                {past.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
