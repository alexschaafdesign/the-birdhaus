import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventBySlug, getTodayCentral } from '@/lib/song-club';
import { getPlaylist } from '@/lib/club-music';
import SongClubRSVPForm from '@/components/SongClubRSVPForm';

export const dynamic = 'force-dynamic';

// "2026-08-15" -> "Saturday, August 15, 2026"
function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event || !event.published) return { title: 'Song Club' };
  return {
    title: `${event.title} — Song Club`,
    description: event.description?.slice(0, 200) ?? 'A Birdhaus songwriter meetup. RSVP to join.',
    openGraph: event.flyer_url ? { images: [event.flyer_url] } : undefined,
  };
}

export default async function SongClubEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const event = await getEventBySlug((await params).slug);
  // Drafts 404 to the public — same as any unpublished content.
  if (!event || !event.published) notFound();

  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;
  const isUpcoming = event.event_date >= getTodayCentral();
  const round = event.playlist_id ? await getPlaylist(event.playlist_id) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link href="/song-club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club
      </Link>

      <header className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          {formatDate(event.event_date)}
          {timeLine ? ` · ${timeLine}` : ''}
        </div>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
      </header>

      {event.flyer_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.flyer_url}
          alt={event.title}
          className="mt-5 w-full max-w-md rounded-lg border border-[#E8E0D0]/15"
        />
      )}

      {event.venue_name && (
        <p className="mt-5 text-[15px] text-[#E8E0D0]/80">{event.venue_name}</p>
      )}

      {event.description && (
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#E8E0D0]/80">
          {event.description}
        </div>
      )}

      {round && (
        <Link
          href={`/club/music/${round.id}`}
          className="mt-6 flex items-center gap-4 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.06] p-4 transition hover:border-[#c8a26a]/60 hover:bg-[#c8a26a]/[0.1]"
        >
          {round.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={round.imageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-[#c8a26a]/80">
              Song Club round
            </div>
            <div className="truncate font-medium text-[#E8E0D0]">{round.title}</div>
            <div className="text-sm text-[#E8E0D0]/55">
              Listen &amp; share your track in the members&rsquo; portal →
            </div>
          </div>
        </Link>
      )}

      {isUpcoming ? (
        <section className="mt-8 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-5">
          <h2 className="text-lg font-medium">RSVP for this meetup</h2>
          <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
            RSVP below to get the address and full details emailed to you.
          </p>
          <SongClubRSVPForm eventId={event.id} />
        </section>
      ) : (
        <p className="mt-8 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 text-sm text-[#E8E0D0]/50">
          This meetup has already happened.
        </p>
      )}
    </main>
  );
}
