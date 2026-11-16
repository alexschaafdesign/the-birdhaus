import Link from 'next/link';
import { getUpcomingShowsMissingSoundEngineer } from '@/lib/sound-engineers';
import { Panel, StatusMark, ADMIN_TABLE, ADMIN_TYPE, buttonClassName } from './ui';

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
    <Panel
      title="Shows needing a sound engineer"
      action={
        shows.length === 0 ? (
          <StatusMark tone="ok">All covered</StatusMark>
        ) : (
          <StatusMark tone="problem">{shows.length} open</StatusMark>
        )
      }
    >
      {shows.length === 0 ? (
        <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted}`}>
          Every upcoming show has a confirmed sound engineer. Nicely done.
        </p>
      ) : (
        <ul className={ADMIN_TABLE.list}>
          {shows.map((show) => (
            <li key={show.id} className="flex items-center justify-between gap-4 py-2.5">
              <Link
                href={`/admin/shows/${show.id}`}
                className={`min-w-0 hover:text-accent-red ${ADMIN_TYPE.focus}`}
              >
                <span className="text-body-3 block truncate font-bold">{show.title}</span>
                <span className={`${ADMIN_TYPE.meta} block`}>
                  {formatDate(show.date)}
                  {show.askedNames.length > 0 && ` · asked ${show.askedNames.join(', ')}`}
                </span>
              </Link>
              <Link
                href={`/admin/shows/${show.id}`}
                className={buttonClassName('secondary', 's')}
              >
                Assign
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
