import Link from 'next/link';
import {
  activeIssues,
  categoriesFor,
  ISSUE_TAB,
  showTabHref,
  type Issue,
  type ShowHealthFacts,
  type ShowTabKey,
} from '@/lib/show-health';

// A one-glance checklist at the top of the Overview tab. Every to-do here is
// one of the show's issues from lib/show-health — the same rules as the shows
// list's chips and the dots on the tabs — so the three can't disagree. A
// dismissed issue (× on the shows list) isn't shown as a to-do here either.
// Purely derived/read-only — no writes here.

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
  facts: ShowHealthFacts;
  today: string;
  confirmedEngineer: string | null;
  doorPerson: string | null;
  photographerName: string | null;
  bandsWithInputs: number;
  activeBandCount: number;
  settlementSaved: boolean;
}

interface ItemProps {
  label: string;
  value: string;
  tone: Tone;
  href?: string;
}

function Item({ label, value, tone, href }: ItemProps) {
  const inner = (
    <>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${DOT[tone]}`} />
      <span className="min-w-0">
        <span className="block text-data-label-10-small uppercase tracking-wide text-surface-ink/60">{label}</span>
        <span className="block text-body-3 text-surface-ink/80 leading-snug">{value}</span>
      </span>
    </>
  );
  const base = 'flex items-start gap-2 border px-3 py-2';
  return href ? (
    <Link href={href} className={`${base} border-surface-ink bg-surface-paper hover:border-accent-red transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={`${base} border-surface-ink bg-surface-paper`}>{inner}</div>
  );
}

export default function ShowOverview({
  showId,
  facts,
  today,
  confirmedEngineer,
  doorPerson,
  photographerName,
  bandsWithInputs,
  activeBandCount,
  settlementSaved,
}: ShowOverviewProps) {
  const isPast = facts.date < today;
  const issues = activeIssues(facts, today, categoriesFor(facts, today));
  const issue = (...keys: string[]): Issue | undefined => issues.find((i) => keys.includes(i.key));
  const href = (tab: ShowTabKey) => showTabHref(showId, tab);
  // An item is a to-do exactly when one of its issues is open.
  const item = (label: string, keys: string[], okValue: string, okTone: Tone, tab?: ShowTabKey): ItemProps => {
    const open = issue(...keys);
    const target = tab ?? (open ? ISSUE_TAB[open.key] : undefined);
    return {
      label,
      value: open ? open.label : okValue,
      tone: open ? 'todo' : okTone,
      href: target && target !== 'overview' ? href(target) : undefined,
    };
  };

  const bandCount = facts.band_count ?? 0;
  const target = facts.target_band_count ?? 3;

  const items: ItemProps[] = isPast
    ? [
        item('Bands paid', ['bands-unpaid'], bandCount > 0 ? 'All paid' : 'No bands', bandCount > 0 ? 'done' : 'neutral', 'settlement'),
        item(
          'Sound paid',
          ['sound-unpaid'],
          facts.sound_engineer_name?.trim() ? 'Paid' : 'No engineer',
          facts.sound_engineer_name?.trim() ? 'done' : 'neutral',
          'settlement'
        ),
        item(
          'Photographer paid',
          ['photographer-unpaid'],
          facts.photographer_name?.trim() ? 'Paid' : 'No photographer',
          facts.photographer_name?.trim() ? 'done' : 'neutral',
          'settlement'
        ),
        {
          label: 'Settlement',
          value: settlementSaved ? 'Saved' : 'Not started',
          tone: settlementSaved ? 'done' : 'todo',
          href: href('settlement'),
        },
        item('Videos', ['videos-missing'], bandCount > 0 ? 'Every set has one' : 'No bands', bandCount > 0 ? 'done' : 'neutral', 'public'),
        { label: 'RSVPs', value: `${facts.rsvp_count ?? 0}`, tone: 'neutral', href: href('door') },
      ]
    : [
        {
          label: 'Announced',
          value: facts.announced ? 'Announced · public' : 'Draft · hidden',
          tone: facts.announced ? 'done' : 'neutral',
        },
        item('Lineup', ['bands'], `${bandCount}/${target} band${target === 1 ? '' : 's'}`, 'done', 'lineup'),
        item('Flyer', ['flyer'], 'Uploaded', 'done'),
        item(
          'Sound engineer',
          ['sound'],
          confirmedEngineer ?? (facts.needs_sound_engineer ? 'None confirmed' : 'Not needed'),
          confirmedEngineer ? 'done' : 'neutral',
          'lineup'
        ),
        { label: 'Door', value: doorPerson ?? 'Unassigned', tone: doorPerson ? 'done' : 'neutral', href: href('lineup') },
        {
          label: 'Photographer',
          value: photographerName ?? 'Unassigned',
          tone: photographerName ? 'done' : 'neutral',
          href: href('lineup'),
        },
        item('Advance', ['advance'], 'Sent', 'done', 'advance'),
        item(
          'Input lists',
          ['inputs'],
          activeBandCount > 0 ? `${bandsWithInputs}/${activeBandCount} in` : 'No bands yet',
          facts.advance_sent && activeBandCount > 0 && bandsWithInputs >= activeBandCount ? 'done' : 'neutral',
          'advance'
        ),
        item('RSVPs', ['no-rsvps', 'rsvp-off'], `${facts.rsvp_count ?? 0}`, 'neutral', 'door'),
      ];

  const todoCount = items.filter((i) => i.tone === 'todo').length;

  return (
    <section className="border border-surface-ink bg-surface-paper p-4">
      <h2 className="mb-3 text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
        Overview{todoCount > 0 ? ` · ${todoCount} to do` : ' · all set'}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Item key={it.label} {...it} />
        ))}
      </div>
    </section>
  );
}
