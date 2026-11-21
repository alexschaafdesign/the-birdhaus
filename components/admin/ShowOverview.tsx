import Link from 'next/link';
import type { ReactNode } from 'react';
import AdvanceSentToggle from './AdvanceSentToggle';
import {
  activeIssues,
  categoriesFor,
  ISSUE_TAB,
  showTabHref,
  type Issue,
  type ShowHealthFacts,
  type ShowTabKey,
} from '@/lib/show-health';

// The show's status strip: one-line chips above the tab bar, so it stays put on
// every tab (rendered by the show layout). Every to-do here is
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
  // Replaces the value with an inline control (no link around it).
  control?: ReactNode;
}

function Item({ label, value, tone, href, control }: ItemProps) {
  const inner = (
    <>
      <span className={`h-1.5 w-1.5 shrink-0 ${DOT[tone]}`} />
      <span className="text-data-label-10-small uppercase tracking-wide text-surface-ink/60">{label}</span>
      {control ?? <span className="text-surface-ink">{value}</span>}
    </>
  );
  // One line per chip; a to-do gets a solid ink border so it stands out from
  // the done / neutral ones.
  const base = `inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-1 text-data-caption-13 ${
    tone === 'todo' ? 'border-surface-ink' : 'border-surface-ink/25'
  } bg-surface-paper`;
  return href && !control ? (
    <Link href={href} className={`${base} hover:border-accent-red hover:text-accent-red transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
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
      href: target ? href(target) : undefined,
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
          href: href('overview'),
        },
        item('Lineup', ['bands'], `${bandCount}/${target} band${target === 1 ? '' : 's'}`, 'done', 'overview'),
        item('Flyer', ['flyer'], 'Uploaded', 'done', 'overview'),
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
        {
          ...item('Advance sent', ['advance'], 'Sent', 'done'),
          control: <AdvanceSentToggle showId={showId} sent={Boolean(facts.advance_sent)} />,
        },
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
    <section aria-label="Show status" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
        {todoCount > 0 ? `${todoCount} to do` : 'All set'}
      </span>
      {items.map((it) => (
        <Item key={it.label} {...it} />
      ))}
    </section>
  );
}
