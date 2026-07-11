import Link from 'next/link';
import type { Show } from '@/lib/shows';

function formatCardDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

function bandNames(show: Show) {
  return show.bands.map((band) => (typeof band === 'string' ? band : band.name)).join(' · ');
}

export default function ShowCard({ show }: { show: Show }) {
  return (
    <Link
      href={`/shows/${show.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-[#E8E0D0]/20 bg-[#E8E0D0]/5 transition-colors hover:border-[#E8E0D0]/60"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#E8E0D0]/10">
        {show.flyer ? (
          <img
            src={show.flyer}
            alt={`${show.title} flyer`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-[#E8E0D0]/40">
            {show.title}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pb-3 pt-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/70">
            {formatCardDate(show.date)}
          </p>
          <h3 className="text-lg font-bold leading-tight text-[#E8E0D0]">{show.title}</h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-[#E8E0D0]/60">{bandNames(show)}</p>
        <span className="flex-shrink-0 text-xs text-[#E8E0D0]/50 transition-colors group-hover:text-[#E8E0D0]">
          RSVP →
        </span>
      </div>
    </Link>
  );
}
