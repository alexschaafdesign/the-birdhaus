'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShowBandPaidStatus } from '@/lib/bands';
import { PAID_METHODS, type PaidMethod } from '@/lib/settlements';
import SoundEngineerNameInput from './SoundEngineerNameInput';
import { FORM } from '@/components/night/form';
import { Swatch, ADMIN_TYPE, buttonClassName } from './ui';

export interface ShowListItem {
  id: number;
  slug: string;
  title: string;
  date: string;
  announced: boolean;
  flyer?: string | null;
  sound_engineer_name?: string | null;
  rsvp_form?: boolean;
  band_count?: number;
  target_band_count?: number;
  ignored_health_checks?: string[];
  advance_sent?: boolean;
  rsvp_count?: number;
  guest_count?: number;
  sound_paid?: boolean;
  photographer_paid?: boolean;
  photographer_name?: string | null;
  bands_paid_count?: number;
  bands_with_video_count?: number;
  bands_missing_inputs?: number;
  tickets_sold?: number;
  revenue_cents?: number;
  ticket_limit?: number | null;
  credited_extra?: number;
}

interface Issue {
  key: string;
  label: string;
}

type IssueCategory = 'statusRsvp' | 'preShow' | 'postShow';

interface CategorizedIssues {
  statusRsvp: Issue[];
  preShow: Issue[];
  postShow: Issue[];
}

// "Close to the date" threshold for the zero-RSVPs check.
const RSVP_WARNING_WINDOW_DAYS = 7;

function daysUntil(today: string, date: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Computes every issue that currently applies to a show, grouped into three
// categories, regardless of whether it's been dismissed — dismissal is
// filtered out by the caller. postShow checks only make sense once the show
// has actually happened (payouts, videos), so callers only surface that
// category for past shows.
function computeIssues(show: ShowListItem, today: string): CategorizedIssues {
  const statusRsvp: Issue[] = [];
  if (show.rsvp_form === false) statusRsvp.push({ key: 'rsvp-off', label: 'RSVP form disabled' });
  const days = daysUntil(today, show.date);
  if (
    show.announced &&
    show.rsvp_form !== false &&
    days >= 0 &&
    days <= RSVP_WARNING_WINDOW_DAYS &&
    !show.rsvp_count
  ) {
    statusRsvp.push({ key: 'no-rsvps', label: `No RSVPs yet (${days}d out)` });
  }

  const preShow: Issue[] = [];
  if (!show.sound_engineer_name?.trim()) preShow.push({ key: 'sound', label: 'No sound engineer' });
  if (!show.flyer?.trim()) preShow.push({ key: 'flyer', label: 'No flyer' });
  if (!show.advance_sent) preShow.push({ key: 'advance', label: 'Not advanced yet' });
  const bandsNeeded = (show.target_band_count ?? 3) - (show.band_count ?? 0);
  if (bandsNeeded > 0) {
    preShow.push({ key: 'bands', label: `Need ${bandsNeeded} band${bandsNeeded === 1 ? '' : 's'}` });
  }
  // Input lists come in via the advance, so only flag missing ones once it's been
  // sent — before that, "Not advanced yet" already covers the next step.
  const bandsMissingInputs = show.bands_missing_inputs ?? 0;
  if (show.advance_sent && bandsMissingInputs > 0) {
    preShow.push({
      key: 'inputs',
      label: `Input lists needed (${bandsMissingInputs} band${bandsMissingInputs === 1 ? '' : 's'})`,
    });
  }

  const postShow: Issue[] = [];
  const bandCount = show.band_count ?? 0;
  const bandsUnpaid = bandCount - (show.bands_paid_count ?? 0);
  if (bandCount > 0 && bandsUnpaid > 0) {
    postShow.push({ key: 'bands-unpaid', label: `${bandsUnpaid} band${bandsUnpaid === 1 ? '' : 's'} unpaid` });
  }
  if (show.sound_engineer_name?.trim() && !show.sound_paid) {
    postShow.push({ key: 'sound-unpaid', label: 'Sound engineer unpaid' });
  }
  if (show.photographer_name?.trim() && !show.photographer_paid) {
    postShow.push({ key: 'photographer-unpaid', label: 'Photographer unpaid' });
  }
  const bandsMissingVideo = bandCount - (show.bands_with_video_count ?? 0);
  if (bandCount > 0 && bandsMissingVideo > 0) {
    postShow.push({
      key: 'videos-missing',
      label: `Videos missing for ${bandsMissingVideo} band${bandsMissingVideo === 1 ? '' : 's'}`,
    });
  }

  return { statusRsvp, preShow, postShow };
}

// Returns the set of issue keys that currently apply to a show for the given
// categories, excluding any the user has dismissed. Shared by the "what's
// needed" filter bar and its per-filter counts so both track computeIssues.
function activeIssueKeys(show: ShowListItem, today: string, categories: IssueCategory[]): Set<string> {
  const ignored = new Set(show.ignored_health_checks ?? []);
  const categorized = computeIssues(show, today);
  const keys = new Set<string>();
  for (const category of categories) {
    for (const issue of categorized[category]) {
      if (!ignored.has(issue.key)) keys.add(issue.key);
    }
  }
  return keys;
}

// The filterable "what's needed" chips. Each maps to an issue key from
// computeIssues; `category` decides which show group (upcoming vs past) it
// applies to, matching where that issue is surfaced as a tag.
const FILTER_DEFS: { key: string; label: string; category: IssueCategory }[] = [
  { key: 'sound', label: 'Needs sound engineer', category: 'preShow' },
  { key: 'bands', label: 'Needs bands', category: 'preShow' },
  { key: 'flyer', label: 'Needs flyer', category: 'preShow' },
  { key: 'advance', label: 'Not advanced', category: 'preShow' },
  { key: 'inputs', label: 'Needs input lists', category: 'preShow' },
  { key: 'rsvp-off', label: 'RSVP form off', category: 'statusRsvp' },
  { key: 'no-rsvps', label: 'No RSVPs yet', category: 'statusRsvp' },
  { key: 'bands-unpaid', label: 'Bands unpaid', category: 'postShow' },
  { key: 'sound-unpaid', label: 'Sound unpaid', category: 'postShow' },
  { key: 'photographer-unpaid', label: 'Photographer unpaid', category: 'postShow' },
  { key: 'videos-missing', label: 'Videos missing', category: 'postShow' },
];

const UPCOMING_CATEGORIES: IssueCategory[] = ['statusRsvp', 'preShow'];
const PAST_CATEGORIES: IssueCategory[] = ['postShow'];

// One consistent color per issue type, so the list is scannable by hue — every
// "Not advanced yet" chip looks the same and different from every "Input lists
// needed" chip. Colors only need to be distinct *within* a row's categories:
// upcoming rows show statusRsvp + preShow together (so those 7 keys are all
// distinct), past rows show only postShow (its 4 keys distinct among themselves,
// free to reuse hues from the upcoming set). Full literal class strings so
// Tailwind's JIT picks them up. `pill` styles the chip, `dismiss` the "×", and
// `action` the PaidTag "Mark paid" button.
type ChipColor = 'rose' | 'sky' | 'violet' | 'fuchsia' | 'amber' | 'orange' | 'slate' | 'teal';

// On paper every chip is an ink-bordered label; the category is told apart by a
// small DS spectrum swatch (fill-only colours) at its start.
const CHIP_PILL = 'border-surface-ink text-surface-ink';
const CHIP_DISMISS = 'cursor-pointer text-surface-ink/60 hover:text-accent-red';
const CHIP_ACTION = 'cursor-pointer bg-surface-paper-shade hover:bg-surface-ink hover:text-surface-paper';
const CHIP_SWATCH: Record<ChipColor, string> = {
  rose: 'bg-spectrum-red',
  sky: 'bg-surface-ink',
  violet: 'bg-spectrum-violet',
  fuchsia: 'bg-spectrum-magenta',
  amber: 'bg-spectrum-amber',
  orange: 'bg-spectrum-orange',
  slate: 'border border-surface-ink bg-surface-paper',
  teal: 'bg-surface-ink/50',
};
const CHIP_CLASSES = Object.fromEntries(
  (Object.keys(CHIP_SWATCH) as ChipColor[]).map((c) => [
    c,
    { pill: CHIP_PILL, dismiss: CHIP_DISMISS, action: CHIP_ACTION, swatch: CHIP_SWATCH[c] },
  ]),
) as Record<ChipColor, { pill: string; dismiss: string; action: string; swatch: string }>;

const ISSUE_COLOR: Record<string, ChipColor> = {
  // Upcoming rows (statusRsvp + preShow) — all distinct:
  advance: 'rose',
  inputs: 'sky',
  sound: 'violet',
  flyer: 'fuchsia',
  bands: 'amber',
  'no-rsvps': 'orange',
  'rsvp-off': 'slate',
  // Past rows (postShow) — distinct among themselves:
  'bands-unpaid': 'amber',
  'sound-unpaid': 'violet',
  'photographer-unpaid': 'fuchsia',
  'videos-missing': 'sky',
};

function chipClasses(key: string) {
  return CHIP_CLASSES[ISSUE_COLOR[key] ?? 'amber'];
}

const inputClass = FORM.field;

export default function ShowsList({ initialShows, today }: { initialShows: ShowListItem[]; today: string }) {
  const [shows, setShows] = useState<ShowListItem[]>(initialShows);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // "Ask an engineer about a batch of dates" flow: a select mode that adds a
  // checkbox to each upcoming show, plus a toolbar to log one engineer as
  // 'asked' across everything selected in a single request.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [engineerName, setEngineerName] = useState('');
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  function toggleSelect(id: number) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setEngineerName('');
  }

  async function applyAskedEngineer() {
    const name = engineerName.trim();
    if (!name || selectedIds.size === 0) return;
    setApplying(true);
    setErrorMessage(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/sound-engineers/bulk-asked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, showIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to update — try again.');
      const added = data.added as number;
      const skipped = data.skipped as number;
      const parts = [`Asked ${data.engineer.name} about ${added} show${added === 1 ? '' : 's'}`];
      if (skipped > 0) parts.push(`${skipped} already had them`);
      setFlash(parts.join(' · '));
      exitSelectMode();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update — try again.');
    } finally {
      setApplying(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shows;
    return shows.filter(
      (s) => s.title.toLowerCase().includes(q) || s.date.includes(q) || s.slug.includes(q)
    );
  }, [shows, search]);

  function toggleFilter(key: string) {
    setActiveFilters((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const { upcoming, past, filterCounts } = useMemo(() => {
    const upcomingAll = filtered
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)); // next show first
    const pastAll = filtered
      .filter((s) => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date)); // most recent first

    // Per-filter counts over the search-filtered set (before applying the
    // "what's needed" filter), so a chip shows how many shows it would surface.
    const filterCounts: Record<string, number> = {};
    for (const def of FILTER_DEFS) {
      const group = def.category === 'postShow' ? pastAll : upcomingAll;
      filterCounts[def.key] = group.reduce(
        (n, s) => n + (activeIssueKeys(s, today, [def.category]).has(def.key) ? 1 : 0),
        0
      );
    }

    if (activeFilters.size === 0) {
      return { upcoming: upcomingAll, past: pastAll, filterCounts };
    }

    // A show matches when it has any of the active filters' issues (OR), scoped
    // to the categories that group actually surfaces.
    const matches = (s: ShowListItem, categories: IssueCategory[]) => {
      const keys = activeIssueKeys(s, today, categories);
      for (const key of activeFilters) if (keys.has(key)) return true;
      return false;
    };
    return {
      upcoming: upcomingAll.filter((s) => matches(s, UPCOMING_CATEGORIES)),
      past: pastAll.filter((s) => matches(s, PAST_CATEGORIES)),
      filterCounts,
    };
  }, [filtered, today, activeFilters]);

  async function setIgnored(showId: number, nextIgnored: string[]) {
    const previous = shows;
    setShows((cur) => cur.map((s) => (s.id === showId ? { ...s, ignored_health_checks: nextIgnored } : s)));
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignoredHealthChecks: nextIgnored }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setShows(previous);
      setErrorMessage('Failed to update — try again.');
    }
  }

  function dismissIssue(show: ShowListItem, key: string) {
    const current = show.ignored_health_checks ?? [];
    if (current.includes(key)) return;
    setIgnored(show.id, [...current, key]);
  }

  // Marks one band paid/unpaid for a show (recording how it was paid) and
  // adjusts the show's cached paid count so the "N bands unpaid" tag updates
  // without a reload.
  async function markBandPaid(showId: number, bandId: number, paid: boolean, method: PaidMethod | null) {
    const previous = shows;
    setShows((cur) =>
      cur.map((s) =>
        s.id === showId
          ? { ...s, bands_paid_count: Math.max(0, (s.bands_paid_count ?? 0) + (paid ? 1 : -1)) }
          : s
      )
    );
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, paidMethod: paid ? method : null }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setShows(previous);
      setErrorMessage('Failed to update payout — try again.');
    }
  }

  // Marks the sound engineer or photographer paid for a show (recording how),
  // flipping the cached flag so the corresponding tag clears immediately.
  async function markCrewPaid(
    showId: number,
    role: 'sound' | 'photographer',
    paid: boolean,
    method: PaidMethod | null
  ) {
    const previous = shows;
    const column = role === 'sound' ? 'sound_paid' : 'photographer_paid';
    setShows((cur) => cur.map((s) => (s.id === showId ? { ...s, [column]: paid } : s)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          role === 'sound'
            ? { soundPaid: paid, soundPaidMethod: paid ? method : null }
            : { photographerPaid: paid, photographerPaidMethod: paid ? method : null }
        ),
      });
      if (!res.ok) throw new Error();
    } catch {
      setShows(previous);
      setErrorMessage('Failed to update payout — try again.');
    }
  }

  return (
    <div>
      {errorMessage && (
        <div role="alert" className={`${FORM.error} mb-4 flex items-center justify-between gap-3`}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className={ADMIN_TYPE.link}>
            Dismiss
          </button>
        </div>
      )}

      {flash && (
        <div role="status" className={`${FORM.notice} mb-4 flex items-center justify-between gap-3`}>
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash(null)} className={ADMIN_TYPE.link}>
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="text"
          placeholder="Search title, date, slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-full max-w-sm`}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={buttonClassName(selectMode ? 'primary' : 'secondary', 's')}
          >
            {selectMode ? 'Cancel selection' : 'Ask an engineer…'}
          </button>
          <Link
            href="/admin/events/new"
            className={buttonClassName('primary', 's')}
          >
            + New event
          </Link>
        </div>
      </div>

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border border-surface-ink bg-surface-paper-shade px-4 py-3">
          <span className="text-body-3 text-surface-ink/80">
            {selectedIds.size === 0
              ? 'Check the upcoming shows you asked about, then pick the engineer.'
              : `${selectedIds.size} show${selectedIds.size === 1 ? '' : 's'} selected`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-56">
              <SoundEngineerNameInput
                placeholder="Engineer name…"
                value={engineerName}
                onChange={setEngineerName}
                onSelect={(match) => setEngineerName(match.name)}
                className={`${inputClass} w-full`}
              />
            </div>
            <button
              type="button"
              onClick={applyAskedEngineer}
              disabled={applying || selectedIds.size === 0 || !engineerName.trim()}
              className={buttonClassName('primary', 's')}
            >
              {applying ? 'Saving…' : 'Mark asked'}
            </button>
          </div>
        </div>
      )}

      {(() => {
        const visibleDefs = FILTER_DEFS.filter(
          (d) => filterCounts[d.key] > 0 || activeFilters.has(d.key)
        );
        if (visibleDefs.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`${ADMIN_TYPE.overline} text-surface-ink/60 mr-1`}>Needs</span>
            {visibleDefs.map((def) => {
              const active = activeFilters.has(def.key);
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => toggleFilter(def.key)}
                  aria-pressed={active}
                  className={`flex cursor-pointer items-center gap-1.5 text-data-caption-13 px-2.5 py-1 border ${
                    active
                      ? 'border-surface-ink bg-surface-ink text-surface-paper font-bold'
                      : 'border-surface-ink hover:bg-surface-paper-shade'
                  }`}
                >
                  {def.label}
                  <span className={active ? '' : 'text-surface-ink/60'}>
                    {filterCounts[def.key]}
                  </span>
                </button>
              );
            })}
            {activeFilters.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilters(new Set())}
                className={`text-data-caption-13 ${ADMIN_TYPE.link}`}
              >
                Clear
              </button>
            )}
          </div>
        );
      })()}

      <p className={`${ADMIN_TYPE.meta} mb-3`}>
        {activeFilters.size > 0
          ? `${upcoming.length + past.length} of ${shows.length} shows shown`
          : `${filtered.length} of ${shows.length} shows shown`}
      </p>

      {upcoming.length + past.length === 0 ? (
        <p className="text-surface-ink/60 text-body-3 py-8 text-center">
          No shows match {activeFilters.size > 0 ? 'these filters' : 'this search'}.
        </p>
      ) : (
        <div className="space-y-8">
          <ShowGroup
            title="Upcoming Shows"
            shows={upcoming}
            today={today}
            onDismissIssue={dismissIssue}
            onMarkBandPaid={markBandPaid}
            onMarkCrewPaid={markCrewPaid}
            issueCategories={['statusRsvp', 'preShow']}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          <ShowGroup
            title="Past Shows"
            shows={past}
            today={today}
            onDismissIssue={dismissIssue}
            onMarkBandPaid={markBandPaid}
            onMarkCrewPaid={markCrewPaid}
            issueCategories={['postShow']}
          />
        </div>
      )}
    </div>
  );
}

function ShowGroup({
  title,
  shows,
  today,
  onDismissIssue,
  onMarkBandPaid,
  onMarkCrewPaid,
  issueCategories,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: {
  title: string;
  shows: ShowListItem[];
  today: string;
  onDismissIssue: (show: ShowListItem, key: string) => void;
  onMarkBandPaid: (showId: number, bandId: number, paid: boolean, method: PaidMethod | null) => void;
  onMarkCrewPaid: (showId: number, role: 'sound' | 'photographer', paid: boolean, method: PaidMethod | null) => void;
  issueCategories: IssueCategory[];
  // Present only for the selectable (Upcoming) group's bulk "ask engineer" flow.
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
}) {
  const router = useRouter();
  const selectable = selectMode && Boolean(onToggleSelect);
  if (shows.length === 0) return null;
  return (
    <section>
      <h2 className={`${ADMIN_TYPE.overline} mb-3`}>
        {title} <span className="text-surface-ink/60">({shows.length})</span>
      </h2>
      <div className="space-y-2">
        {shows.map((show) => {
          const ignored = new Set(show.ignored_health_checks ?? []);
          const categorized = computeIssues(show, today);
          const clusters = issueCategories
            .map((category) => categorized[category].filter((issue) => !ignored.has(issue.key)))
            .filter((cluster) => cluster.length > 0);
          const checked = selectedIds?.has(show.id) ?? false;
          return (
            <div
              key={show.id}
              onClick={() =>
                selectable ? onToggleSelect?.(show.id) : router.push(`/admin/shows/${show.id}`)
              }
              className={`flex items-center justify-between gap-4 border border-surface-ink px-4 py-3 cursor-pointer ${
                selectable && checked ? 'bg-surface-paper-shade' : 'bg-surface-paper hover:bg-surface-paper-shade'
              }`}
            >
              {selectable && (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect?.(show.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 h-4 w-4 accent-surface-ink"
                  aria-label={`Select ${show.title}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-body-3 text-surface-ink/60 tabular-nums">{show.date}</span>
                  <span className="font-bold truncate">{show.title}</span>
                  {show.announced ? (
                    // "Announced" is a pre-show publish state; drop it for past shows.
                    show.date >= today && (
                      <span className="text-data-caption-13 px-2 py-0.5 border border-surface-ink text-surface-ink">
                        Announced
                      </span>
                    )
                  ) : (
                    <span className="text-data-caption-13 px-2 py-0.5 border border-surface-ink text-surface-ink/60">
                      Draft
                    </span>
                  )}
                  {!!show.rsvp_count && (
                    <span className="text-data-caption-13 px-2 py-0.5 border border-surface-ink text-surface-ink/60 whitespace-nowrap">
                      {show.rsvp_count} RSVP{show.rsvp_count === 1 ? '' : 's'} · {show.guest_count} guest
                      {show.guest_count === 1 ? '' : 's'}
                    </span>
                  )}
                  {(!!show.tickets_sold ||
                    typeof show.ticket_limit === 'number' ||
                    (show.credited_extra ?? 0) > 0) &&
                    (() => {
                      // Effective attendance = online sales + extra heads from
                      // per-RSVP credits; the cap measures against this.
                      const sold = show.tickets_sold ?? 0;
                      const adj = show.credited_extra ?? 0;
                      const effective = sold + adj;
                      const capped = typeof show.ticket_limit === 'number';
                      const soldOut = capped && effective >= (show.ticket_limit as number);
                      return (
                        <span
                          className={`text-data-caption-13 px-2 py-0.5  border whitespace-nowrap ${
                            soldOut
                              ? 'border-accent-red text-accent-red'
                              : 'border-surface-ink text-surface-ink'
                          }`}
                        >
                          {sold}
                          {adj > 0 ? ` +${adj}` : ''}
                          {capped ? `/${show.ticket_limit}` : ''} ticket
                          {sold === 1 && adj === 0 && !capped ? '' : 's'} · $
                          {Math.round((show.revenue_cents ?? 0) / 100)}
                          {soldOut ? ' · SOLD OUT' : ''}
                        </span>
                      );
                    })()}
                  {clusters.map((cluster, clusterIndex) => (
                    <span key={clusterIndex} className="flex items-center gap-1.5 flex-wrap">
                      {clusterIndex > 0 && <span className="w-px h-4 bg-surface-ink/30" />}
                      {cluster.map((issue) =>
                        issue.key === 'bands-unpaid' ||
                        issue.key === 'sound-unpaid' ||
                        issue.key === 'photographer-unpaid' ? (
                          <PaidTag
                            key={issue.key}
                            show={show}
                            issueKey={issue.key}
                            label={issue.label}
                            onDismiss={() => onDismissIssue(show, issue.key)}
                            onMarkBandPaid={onMarkBandPaid}
                            onMarkCrewPaid={onMarkCrewPaid}
                          />
                        ) : (
                          <span
                            key={issue.key}
                            className={`flex items-center gap-1.5 text-data-caption-13 pl-2 pr-1 py-0.5  border whitespace-nowrap ${chipClasses(issue.key).pill}`}
                          >
                            <Swatch className={chipClasses(issue.key).swatch} />
                            {issue.label}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDismissIssue(show, issue.key);
                              }}
                              title="Not an issue for this show"
                              className={`leading-none ${chipClasses(issue.key).dismiss}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const PAID_METHOD_LABEL: Record<PaidMethod, string> = { cash: 'cash', venmo: 'Venmo' };

// Compact cash/venmo button pair for the popover rows — marking paid records
// how the payment was made; a paid row collapses to "✓ method", which unmarks
// on click.
function PaidMethodButtons({
  paid,
  method,
  onChange,
}: {
  paid: boolean;
  method: PaidMethod | null;
  onChange: (paid: boolean, method: PaidMethod | null) => void;
}) {
  if (paid) {
    return (
      <button
        type="button"
        onClick={() => onChange(false, null)}
        title="Click to mark unpaid"
        className="shrink-0 text-data-caption-13 text-surface-ink hover:text-accent-red"
      >
        ✓ {method ? PAID_METHOD_LABEL[method] : 'paid'}
      </button>
    );
  }
  return (
    <span className="flex shrink-0 gap-1">
      {PAID_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(true, m)}
          title={`Mark paid by ${PAID_METHOD_LABEL[m]}`}
          className="cursor-pointer border border-surface-ink px-1.5 py-0.5 text-data-label-10-small hover:bg-surface-paper-shade"
        >
          {PAID_METHOD_LABEL[m]}
        </button>
      ))}
    </span>
  );
}

// A post-show "unpaid" tag with an explicit "Mark paid" button that opens a
// small popover — one row per band, or a single row for the sound engineer /
// photographer, each with cash/venmo buttons that record how the payout was
// made. Toggling calls back up so the tag clears (or its count drops) live.
// The label text is plain; only the button opens the popover so the affordance
// is obvious.
function PaidTag({
  show,
  issueKey,
  label,
  onDismiss,
  onMarkBandPaid,
  onMarkCrewPaid,
}: {
  show: ShowListItem;
  issueKey: 'bands-unpaid' | 'sound-unpaid' | 'photographer-unpaid';
  label: string;
  onDismiss: () => void;
  onMarkBandPaid: (showId: number, bandId: number, paid: boolean, method: PaidMethod | null) => void;
  onMarkCrewPaid: (showId: number, role: 'sound' | 'photographer', paid: boolean, method: PaidMethod | null) => void;
}) {
  const isBands = issueKey === 'bands-unpaid';
  const [open, setOpen] = useState(false);
  const [bands, setBands] = useState<ShowBandPaidStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  async function loadBands() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/settlements/${show.id}/bands`);
      if (!res.ok) throw new Error();
      setBands((await res.json()) as ShowBandPaidStatus[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && isBands && bands === null && !loading) loadBands();
  }

  function handleBandToggle(bandId: number, paid: boolean, method: PaidMethod | null) {
    setBands((cur) =>
      cur ? cur.map((b) => (b.bandId === bandId ? { ...b, paid, paidMethod: paid ? method : null } : b)) : cur
    );
    onMarkBandPaid(show.id, bandId, paid, method);
  }

  const crewRole = issueKey === 'sound-unpaid' ? 'sound' : 'photographer';
  const crewName =
    (issueKey === 'sound-unpaid' ? show.sound_engineer_name : show.photographer_name)?.trim() ||
    (issueKey === 'sound-unpaid' ? 'Sound engineer' : 'Photographer');

  const color = chipClasses(issueKey);
  return (
    // Stop clicks bubbling to the row (which navigates to the show's edit page).
    <span ref={containerRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <span className={`flex items-center gap-1.5 text-data-caption-13 pl-2 pr-1 py-0.5  border whitespace-nowrap ${color.pill}`}>
        <Swatch className={color.swatch} />
        {label}
        <button
          type="button"
          onClick={toggleOpen}
          className={`flex items-center gap-0.5  px-1.5 py-0.5 ${color.action}`}
          title="Mark paid"
        >
          Mark paid
          <span className="text-data-label-10-small leading-none">▾</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title="Not an issue for this show"
          className={`leading-none ${color.dismiss}`}
        >
          ×
        </button>
      </span>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-60  border border-surface-ink bg-surface-paper p-3  text-surface-ink">
          <p className={`${ADMIN_TYPE.overline} text-surface-ink/60 mb-2`}>
            {isBands ? 'Band payouts' : 'Payout'}
          </p>
          {isBands ? (
            <>
              {loading && <p className="text-data-caption-13 text-surface-ink/60">Loading…</p>}
              {loadError && (
                <p className="text-data-caption-13 text-accent-red">
                  Failed to load.{' '}
                  <button type="button" onClick={loadBands} className="underline">
                    Retry
                  </button>
                </p>
              )}
              {bands && bands.length === 0 && (
                <p className="text-data-caption-13 text-surface-ink/60">No bands linked to this show.</p>
              )}
              {bands && bands.length > 0 && (
                <div className="space-y-1.5">
                  {bands.map((band) =>
                    band.excluded ? (
                      <div
                        key={band.bandId}
                        className="flex items-center justify-between gap-2 text-body-3  px-1 py-0.5 opacity-50"
                      >
                        <span className="line-through">{band.name}</span>
                        <span className="text-data-caption-13 text-surface-ink/60">excluded</span>
                      </div>
                    ) : (
                      <div
                        key={band.bandId}
                        className="flex items-center justify-between gap-2 text-body-3  px-1 py-0.5"
                      >
                        <span className={`truncate ${band.paid ? 'text-surface-ink/60 line-through' : ''}`}>
                          {band.name}
                        </span>
                        <PaidMethodButtons
                          paid={band.paid}
                          method={band.paidMethod}
                          onChange={(paid, method) => handleBandToggle(band.bandId, paid, method)}
                        />
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            // The tag only renders while unpaid, so this row never needs the
            // paid/unmark state — picking a method marks paid and clears it.
            <div className="flex items-center justify-between gap-2 text-body-3  px-1 py-0.5">
              <span className="truncate">{crewName}</span>
              <PaidMethodButtons
                paid={false}
                method={null}
                onChange={(paid, method) => onMarkCrewPaid(show.id, crewRole, paid, method)}
              />
            </div>
          )}
        </div>
      )}
    </span>
  );
}
