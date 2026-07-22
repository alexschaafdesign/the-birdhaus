'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

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

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setShows((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/admin/shows/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setErrorMessage('Failed to delete — refresh and try again.');
    }
  }

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
            onDelete={handleDelete}
            onDismissIssue={dismissIssue}
            issueCategories={['statusRsvp', 'preShow']}
          />
          <ShowGroup
            title="Past Shows"
            shows={past}
            today={today}
            onDelete={handleDelete}
            onDismissIssue={dismissIssue}
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
  onDelete,
  onDismissIssue,
  issueCategories,
}: {
  title: string;
  shows: ShowListItem[];
  today: string;
  onDelete: (id: number, title: string) => void;
  onDismissIssue: (show: ShowListItem, key: string) => void;
  issueCategories: IssueCategory[];
}) {
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
              className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-[#E8E0D0]/50 font-mono">{show.date}</span>
                  <span className="font-semibold truncate">{show.title}</span>
                  {show.announced ? (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                      Announced
                    </span>
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
                      {cluster.map((issue) => (
                        <span
                          key={issue.key}
                          className="flex items-center gap-1.5 text-xs pl-2 pr-1 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap"
                        >
                          {issue.label}
                          <button
                            type="button"
                            onClick={() => onDismissIssue(show, issue.key)}
                            title="Not an issue for this show"
                            className="text-amber-300/50 hover:text-amber-300 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-sm">
                <Link
                  href={`/shows/${show.slug}`}
                  target="_blank"
                  className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                >
                  View
                </Link>
                <Link href={`/admin/shows/${show.id}`} className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                  Edit
                </Link>
                <button
                  onClick={() => onDelete(show.id, show.title)}
                  className="text-red-400/70 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
