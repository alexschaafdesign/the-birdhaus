import Link from 'next/link';

// A one-glance status checklist pinned to the top of the Details tab: where the
// show is in its lifecycle, each item linking to the tab that acts on it. Purely
// derived/read-only — no writes here.

type Tone = 'done' | 'todo' | 'neutral';

const DOT: Record<Tone, string> = {
  done: 'bg-emerald-400',
  todo: 'bg-amber-400',
  neutral: 'bg-[#E8E0D0]/40',
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
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">{label}</span>
        <span className="block text-sm text-[#E8E0D0]/90 leading-snug">{value}</span>
      </span>
    </>
  );
  const base = 'flex items-start gap-2 rounded-lg border px-3 py-2';
  return href ? (
    <Link
      href={href}
      className={`${base} border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.02] hover:border-[#E8E0D0]/35 transition-colors`}
    >
      {inner}
    </Link>
  ) : (
    <div className={`${base} border-[#E8E0D0]/12 bg-[#E8E0D0]/[0.02]`}>{inner}</div>
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
      value: confirmedEngineer ?? 'None confirmed',
      tone: confirmedEngineer ? 'done' : 'todo',
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
    <section className="rounded-xl border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.02] p-4">
      <h2 className="mb-3 text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">
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
