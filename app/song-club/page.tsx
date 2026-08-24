import Link from 'next/link';
import type { Metadata } from 'next';
import { listEvents, getTodayCentral, type SongClubEvent } from '@/lib/song-club';
import { isAdminSession } from '@/lib/admin-session';
import SongClubLogo from '@/components/club/SongClubLogo';

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
        className="flex flex-col overflow-hidden rounded-xl border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06] sm:flex-row"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.flyer_url}
          alt={event.title}
          className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:w-64 sm:shrink-0"
        />
        <div className="flex flex-col justify-center p-5 sm:p-6">
          <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
            {formatDate(event.event_date)}
            {timeLine ? ` · ${timeLine}` : ''}
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#E8E0D0]">{event.title}</div>
          {event.venue_name && (
            <div className="mt-1 text-sm text-[#E8E0D0]/60">{event.venue_name}</div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/song-club/${event.slug}`}
      className="block rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
        {formatDate(event.event_date)}
        {timeLine ? ` · ${timeLine}` : ''}
      </div>
      <div className="mt-1 text-lg font-medium text-[#E8E0D0]">{event.title}</div>
      {event.venue_name && (
        <div className="mt-0.5 text-sm text-[#E8E0D0]/60">{event.venue_name}</div>
      )}
    </Link>
  );
}

export default async function SongClubPage() {
  const events = await listEvents({ publishedOnly: true });
  const isAdmin = await isAdminSession();
  const today = getTodayCentral();
  const upcoming = events.filter((e) => e.event_date >= today).reverse(); // soonest first
  const past = events.filter((e) => e.event_date < today); // most recent first

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <SongClubLogo className="h-16 w-16 sm:h-20 sm:w-20" />
          <div>
            <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Song Club</h1>
            <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
              Song-a-days, monthly songwriter meetups, and more.
            </p>
          </div>
        </div>
        <Link
          href="/club"
          className="shrink-0 rounded-md border border-[#E8E0D0]/30 px-4 py-2 text-sm font-semibold text-[#E8E0D0] transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
        >
          {isAdmin ? 'Song Club portal' : 'Log in'}
        </Link>
      </header>

      {events.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No meetups scheduled yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
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
