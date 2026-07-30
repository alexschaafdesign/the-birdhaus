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

function bandNames(show: Show) {
  return show.bands.map((band) => (typeof band === 'string' ? band : band.name)).join(' · ');
}

export default function ShowCard({ show, draft }: { show: Show; draft?: boolean }) {
  const { day, weekday, month } = formatCardDate(show.date);

  return (
    <Link
      href={draft ? `/admin/shows/${show.id}` : `/shows/${show.slug}`}
      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-[#E8E0D0]/5 transition-colors ${
        draft
          ? 'border-dashed border-yellow-500/50 hover:border-yellow-400'
          : 'border-[#E8E0D0]/20 hover:border-[#E8E0D0]/60'
      }`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#E8E0D0]/10">
        {show.flyer ? (
          <Image
            src={show.flyer}
            alt={`${show.title} flyer`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            unoptimized
            className={`object-cover transition-transform duration-300 group-hover:scale-105 ${draft ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-[#E8E0D0]/40">
            {show.title}
          </div>
        )}
        {draft && (
          <span className="absolute right-2 top-2 rounded bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
            Draft
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-baseline gap-2 bg-gradient-to-t from-black via-black/85 via-40% to-transparent px-4 pb-3 pt-16 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
          <span className="text-3xl font-black leading-none text-[#E8E0D0]">
            {day} {month}
          </span>
          <span className="font-mono text-sm uppercase tracking-widest text-[#E8E0D0]/80">
            - {weekday}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-[#E8E0D0]/60">{bandNames(show)}</p>
        <span className="flex-shrink-0 text-xs text-[#E8E0D0]/50 transition-colors group-hover:text-[#E8E0D0]">
          {draft ? 'Edit →' : 'RSVP →'}
        </span>
      </div>
    </Link>
  );
}
