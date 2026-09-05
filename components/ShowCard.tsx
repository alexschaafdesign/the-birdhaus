import Link from 'next/link';
import Image from 'next/image';
import type { Show } from '@/lib/shows';

function formatCardDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    day: date.getDate(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

export default function ShowCard({ show, draft }: { show: Show; draft?: boolean }) {
  const { day, weekday, month } = formatCardDate(show.date);
  const isSongClub = show.type === 'song_club';
  const href = draft
    ? `/admin/shows/${show.id}`
    : isSongClub
      ? `/song-club/${show.slug}`
      : `/shows/${show.slug}`;

  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden border-2 bg-paper transition-all ${
        draft
          ? 'border-dashed border-ink/50 hover:border-ink'
          : 'border-ink hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard'
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-ink/10">
        {show.flyer ? (
          <Image
            src={show.flyer}
            alt={`${show.title} flyer`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            unoptimized
            className={`object-cover ${draft ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-ink/40">
            {show.title}
          </div>
        )}
        {draft && (
          <span className="absolute right-2 top-2 bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-paper">
            Draft
          </span>
        )}
        {isSongClub && !draft && (
          <span className="absolute left-2 top-2 bg-vhs-red px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-paper">
            Song Club
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t-2 border-ink px-4 py-2.5">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-2xl font-black leading-none">
            {day} {month}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            {weekday}
          </span>
        </span>
        <span className="flex-shrink-0 font-mono text-xs uppercase tracking-wider text-vhs-red">
          {draft ? 'Edit →' : 'RSVP →'}
        </span>
      </div>
    </Link>
  );
}
