import Link from 'next/link';
import { getUpcomingShowsMissingSoundEngineer } from '@/lib/sound-engineers';

// "YYYY-MM-DD" -> "Sat, Aug 15" (no year), matching the terse date style used
// elsewhere in admin.
function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// The 'sound_coverage' focus widget: every upcoming show still missing a
// confirmed sound engineer, each linking to the show editor to assign one.
export default async function SoundCoverageWidget() {
  const shows = await getUpcomingShowsMissingSoundEngineer();

  return (
    <section className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">Shows needing a sound engineer</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            shows.length === 0
              ? 'bg-[#7bb98a]/15 text-[#bfe6c8]'
              : 'bg-[#F5A3A3]/15 text-[#F5A3A3]'
          }`}
        >
          {shows.length}
        </span>
      </div>

      {shows.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/60">
          Every upcoming show has a confirmed sound engineer. Nicely done.
        </p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10">
          {shows.map((show) => (
            <li key={show.id} className="flex items-center justify-between gap-4 py-2.5">
              <Link
                href={`/admin/shows/${show.id}`}
                className="min-w-0 transition hover:text-white"
              >
                <span className="block truncate text-sm font-medium">{show.title}</span>
                <span className="block text-xs text-[#E8E0D0]/50">
                  {formatDate(show.date)}
                  {show.askedNames.length > 0 && ` · asked ${show.askedNames.join(', ')}`}
                </span>
              </Link>
              <Link
                href={`/admin/shows/${show.id}`}
                className="shrink-0 rounded-md border border-[#E8E0D0]/30 px-3 py-1 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0]"
              >
                Assign
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
