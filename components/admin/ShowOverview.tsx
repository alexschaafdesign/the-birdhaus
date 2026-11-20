import Link from 'next/link';

// A one-glance status checklist pinned to the top of the Details tab: where the
// show is in its lifecycle, each item linking to the tab that acts on it. Purely
// derived/read-only — no writes here.

type Tone = 'done' | 'todo' | 'neutral';

// Done is ink, to-do the amber attention fill, neutral an empty ink box (the
// paper admin has no green; see StatusMark).
const DOT: Record<Tone, string> = {
  done: 'bg-surface-ink',
  todo: 'bg-spectrum-amber',
  neutral: 'border border-surface-ink/40',
};

export interface ShowOverviewProps {
  showId: number;
  isPast: boolean;
  announced: boolean;
  bandCount: number;
  targetBandCount: number;
  inviteSent: boolean;
  bandsWithInputs: number;
  confirmedEngineer: string | null;
  // Opt-in (119): off = Alex runs sound, so no confirmed engineer isn't a gap.
  needsSoundEngineer: boolean;
  doorPerson: string | null;
  photographerAssigned: boolean;
  rsvpCount: number;
  settlementSaved: boolean;
}

function Item({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone: Tone;
  href?: string;
}) {
  const inner = (
    <>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0  ${DOT[tone]}`} />
      <span className="min-w-0">
        <span className="block text-data-label-10-small uppercase tracking-wide text-surface-ink/60">{label}</span>
        <span className="block text-body-3 text-surface-ink/80 leading-snug">{value}</span>
      </span>
    </>
  );
  const base = 'flex items-start gap-2  border px-3 py-2';
  return href ? (
    <Link
      href={href}
      className={`${base} border-surface-ink bg-surface-paper hover:border-accent-red transition-colors`}
    >
      {inner}
    </Link>
  ) : (
    <div className={`${base} border-surface-ink bg-surface-paper`}>{inner}</div>
  );
}

export default function ShowOverview({
  showId,
  isPast,
  announced,
  bandCount,
  targetBandCount,
  inviteSent,
  bandsWithInputs,
  confirmedEngineer,
  needsSoundEngineer,
  doorPerson,
  photographerAssigned,
  rsvpCount,
  settlementSaved,
}: ShowOverviewProps) {
  const base = `/admin/shows/${showId}`;
  const lineupFull = bandCount >= targetBandCount;
  const inputsDone = bandCount > 0 && bandsWithInputs >= bandCount;

  const items: Array<{ label: string; value: string; tone: Tone; href?: string }> = [
    {
      label: 'Announced',
      value: announced ? 'Announced' : 'Not announced',
      tone: announced ? 'done' : 'todo',
    },
    {
      label: 'Lineup',
      value: `${bandCount}/${targetBandCount} band${targetBandCount === 1 ? '' : 's'}`,
      tone: lineupFull ? 'done' : 'todo',
    },
    {
      label: 'Sound engineer',
      value: confirmedEngineer ?? (needsSoundEngineer ? 'None confirmed' : 'Not needed'),
      tone: confirmedEngineer ? 'done' : needsSoundEngineer ? 'todo' : 'neutral',
      href: `${base}/crew`,
    },
    {
      label: 'Door',
      value: doorPerson ?? 'Unassigned',
      tone: doorPerson ? 'done' : 'todo',
      href: `${base}/crew`,
    },
    {
      label: 'Photographer',
      value: photographerAssigned ? 'Assigned' : 'Unassigned',
      tone: photographerAssigned ? 'done' : 'neutral',
      href: `${base}/crew`,
    },
    {
      label: 'Portal invite',
      value: inviteSent ? 'Sent' : 'Not sent',
      tone: inviteSent ? 'done' : 'todo',
      href: `${base}/portal`,
    },
    {
      label: 'Input lists',
      value: bandCount > 0 ? `${bandsWithInputs}/${bandCount} in` : 'No bands yet',
      tone: inputsDone ? 'done' : 'todo',
      href: `${base}/inputs`,
    },
    {
      label: 'RSVPs',
      value: `${rsvpCount}`,
      tone: 'neutral',
      href: `${base}/rsvps`,
    },
    {
      label: 'Settlement',
      value: settlementSaved ? 'Saved' : isPast ? 'Not started' : '—',
      tone: settlementSaved ? 'done' : isPast ? 'todo' : 'neutral',
      href: `${base}/settlement`,
    },
  ];

  return (
    <section className="border border-surface-ink bg-surface-paper p-4">
      <h2 className="mb-3 text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
        Overview
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Item key={it.label} {...it} />
        ))}
      </div>
    </section>
  );
}
