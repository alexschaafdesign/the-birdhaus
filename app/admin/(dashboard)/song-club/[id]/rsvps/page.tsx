import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/song-club';
import { getRsvpsForEvent } from '@/lib/song-club-rsvps';
import { getEventSignups } from '@/lib/club-events';
import SongClubRsvpBlast from '@/components/admin/SongClubRsvpBlast';
import EventSignupsTable from '@/components/admin/EventSignupsTable';

export const metadata: Metadata = {
  title: 'RSVPs',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function SongClubRsvpsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const event = Number.isInteger(id) ? await getEventById(id) : null;
  if (!event) notFound();

  // Online (Song-a-day) events collect sign-ups via the participate flow, not
  // the RSVP form — show that roster instead.
  if (event.format === 'online') {
    const signups = await getEventSignups(event.id);
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-8 text-[#E8E0D0]">
        <Link
          href="/admin/song-club"
          className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          ← All meetups
        </Link>

        <div className="mt-4 mb-6">
          <h2 className="text-xl font-medium">Sign-ups — {event.title}</h2>
          <p className="mt-1 text-sm text-[#E8E0D0]/60">
            {signups.length} {signups.length === 1 ? 'sign-up' : 'sign-ups'}
          </p>
        </div>

        <EventSignupsTable eventId={event.id} initialSignups={signups} />
      </main>
    );
  }

  const { rsvps, totalCount, totalGuests } = await getRsvpsForEvent(event.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8 text-[#E8E0D0]">
      <Link
        href="/admin/song-club"
        className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
      >
        ← All meetups
      </Link>

      <div className="mt-4 mb-6">
        <h2 className="text-xl font-medium">RSVPs — {event.title}</h2>
        <p className="mt-1 text-sm text-[#E8E0D0]/60">
          {totalCount} {totalCount === 1 ? 'RSVP' : 'RSVPs'} · {totalGuests} total{' '}
          {totalGuests === 1 ? 'guest' : 'guests'}
        </p>
      </div>

      <SongClubRsvpBlast eventId={event.id} eventTitle={event.title} rsvps={rsvps} />

      {rsvps.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No RSVPs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/15 text-xs uppercase tracking-wide text-[#E8E0D0]/45">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Guests</th>
                <th className="py-2 pr-4 font-medium">RSVP&apos;d</th>
                <th className="py-2 font-medium">Emailed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/10">
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 text-[#E8E0D0]/70">
                    <a href={`mailto:${r.email}`} className="hover:text-[#E8E0D0]">
                      {r.email}
                    </a>
                  </td>
                  <td className="py-2 pr-4">{r.guests}</td>
                  <td className="py-2 pr-4 text-[#E8E0D0]/60">{formatDateTime(r.created_at)}</td>
                  <td className="py-2 text-[#E8E0D0]/60">
                    {r.confirmation_email_sent_at ? '✓' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
