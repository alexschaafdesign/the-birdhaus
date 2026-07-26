'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShowBandPaidStatus } from '@/lib/bands';

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

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function ShowsList({ initialShows, today }: { initialShows: ShowListItem[]; today: string }) {
  const [shows, setShows] = useState<ShowListItem[]>(initialShows);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shows;
    return shows.filter(
      (s) => s.title.toLowerCase().includes(q) || s.date.includes(q) || s.slug.includes(q)
    );
  }, [shows, search]);

  const { upcoming, past } = useMemo(() => {
    const upcoming = filtered
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)); // next show first
    const past = filtered
      .filter((s) => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date)); // most recent first
    return { upcoming, past };
  }, [filtered, today]);

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

  // Marks one band paid/unpaid for a show and adjusts the show's cached
  // paid count so the "N bands unpaid" tag updates without a reload.
  async function markBandPaid(showId: number, bandId: number, paid: boolean) {
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
        body: JSON.stringify({ paid }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setShows(previous);
      setErrorMessage('Failed to update payout — try again.');
    }
  }

  // Marks the sound engineer or photographer paid for a show, flipping the
  // cached flag so the corresponding tag clears immediately.
  async function markCrewPaid(showId: number, role: 'sound' | 'photographer', paid: boolean) {
    const previous = shows;
    const column = role === 'sound' ? 'sound_paid' : 'photographer_paid';
    setShows((cur) => cur.map((s) => (s.id === showId ? { ...s, [column]: paid } : s)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role === 'sound' ? { soundPaid: paid } : { photographerPaid: paid }),
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
        <div className="mb-4 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
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
        <Link
          href="/admin/shows/new"
          className="ml-auto border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
        >
          + New show
        </Link>
      </div>

      <p className="text-xs text-[#E8E0D0]/40 mb-3">
        {filtered.length} of {shows.length} shows shown
      </p>

      {filtered.length === 0 ? (
        <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No shows match this search.</p>
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
}: {
  title: string;
  shows: ShowListItem[];
  today: string;
  onDismissIssue: (show: ShowListItem, key: string) => void;
  onMarkBandPaid: (showId: number, bandId: number, paid: boolean) => void;
  onMarkCrewPaid: (showId: number, role: 'sound' | 'photographer', paid: boolean) => void;
  issueCategories: IssueCategory[];
}) {
  const router = useRouter();
  if (shows.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-3">
        {title} <span className="text-[#E8E0D0]/25">({shows.length})</span>
      </h2>
      <div className="space-y-2">
        {shows.map((show) => {
          const ignored = new Set(show.ignored_health_checks ?? []);
          const categorized = computeIssues(show, today);
          const clusters = issueCategories
            .map((category) => categorized[category].filter((issue) => !ignored.has(issue.key)))
            .filter((cluster) => cluster.length > 0);
          return (
            <div
              key={show.id}
              onClick={() => router.push(`/admin/shows/${show.id}`)}
              className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3 cursor-pointer hover:bg-[#E8E0D0]/[0.04] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-[#E8E0D0]/50 font-mono">{show.date}</span>
                  <span className="font-semibold truncate">{show.title}</span>
                  {show.announced ? (
                    // "Announced" is a pre-show publish state; drop it for past shows.
                    show.date >= today && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                        Announced
                      </span>
                    )
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/50">
                      Draft
                    </span>
                  )}
                  {!!show.rsvp_count && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/60 whitespace-nowrap">
                      {show.rsvp_count} RSVP{show.rsvp_count === 1 ? '' : 's'} · {show.guest_count} guest
                      {show.guest_count === 1 ? '' : 's'}
                    </span>
                  )}
                  {clusters.map((cluster, clusterIndex) => (
                    <span key={clusterIndex} className="flex items-center gap-1.5 flex-wrap">
                      {clusterIndex > 0 && <span className="w-px h-4 bg-[#E8E0D0]/15" />}
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
                            className="flex items-center gap-1.5 text-xs pl-2 pr-1 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap"
                          >
                            {issue.label}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDismissIssue(show, issue.key);
                              }}
                              title="Not an issue for this show"
                              className="text-amber-300/50 hover:text-amber-300 leading-none"
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

// A post-show "unpaid" tag with an explicit "Mark paid" button that opens a
// small popover of checkboxes — one per band, or a single row for the sound
// engineer / photographer. Toggling calls back up so the tag clears (or its
// count drops) live. The label text is plain; only the button opens the popover
// so the affordance is obvious.
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
  onMarkBandPaid: (showId: number, bandId: number, paid: boolean) => void;
  onMarkCrewPaid: (showId: number, role: 'sound' | 'photographer', paid: boolean) => void;
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

  function handleBandToggle(bandId: number, paid: boolean) {
    setBands((cur) => (cur ? cur.map((b) => (b.bandId === bandId ? { ...b, paid } : b)) : cur));
    onMarkBandPaid(show.id, bandId, paid);
  }

  const crewRole = issueKey === 'sound-unpaid' ? 'sound' : 'photographer';
  const crewName =
    (issueKey === 'sound-unpaid' ? show.sound_engineer_name : show.photographer_name)?.trim() ||
    (issueKey === 'sound-unpaid' ? 'Sound engineer' : 'Photographer');

  return (
    // Stop clicks bubbling to the row (which navigates to the show's edit page).
    <span ref={containerRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <span className="flex items-center gap-1.5 text-xs pl-2 pr-1 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap">
        {label}
        <button
          type="button"
          onClick={toggleOpen}
          className="flex items-center gap-0.5 rounded-full bg-amber-400/15 px-1.5 py-0.5 hover:bg-amber-400/25"
          title="Mark paid"
        >
          Mark paid
          <span className="text-[0.6rem] leading-none">▾</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title="Not an issue for this show"
          className="text-amber-300/50 hover:text-amber-300 leading-none"
        >
          ×
        </button>
      </span>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-60 rounded-lg border border-[#E8E0D0]/20 bg-[#2A2420] p-3 shadow-xl text-[#E8E0D0]">
          <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-2">
            {isBands ? 'Band payouts' : 'Payout'}
          </p>
          {isBands ? (
            <>
              {loading && <p className="text-xs text-[#E8E0D0]/40">Loading…</p>}
              {loadError && (
                <p className="text-xs text-red-300">
                  Failed to load.{' '}
                  <button type="button" onClick={loadBands} className="underline">
                    Retry
                  </button>
                </p>
              )}
              {bands && bands.length === 0 && (
                <p className="text-xs text-[#E8E0D0]/40">No bands linked to this show.</p>
              )}
              {bands && bands.length > 0 && (
                <div className="space-y-1.5">
                  {bands.map((band) =>
                    band.excluded ? (
                      <div
                        key={band.bandId}
                        className="flex items-center justify-between gap-2 text-sm rounded px-1 py-0.5 opacity-50"
                      >
                        <span className="line-through">{band.name}</span>
                        <span className="text-xs text-[#E8E0D0]/40">excluded</span>
                      </div>
                    ) : (
                      <label
                        key={band.bandId}
                        className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-[#E8E0D0]/5"
                      >
                        <input
                          type="checkbox"
                          checked={band.paid}
                          onChange={(e) => handleBandToggle(band.bandId, e.target.checked)}
                        />
                        <span className={band.paid ? 'text-[#E8E0D0]/50 line-through' : ''}>{band.name}</span>
                      </label>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-[#E8E0D0]/5">
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => onMarkCrewPaid(show.id, crewRole, e.target.checked)}
              />
              <span>{crewName}</span>
            </label>
          )}
        </div>
      )}
    </span>
  );
}
