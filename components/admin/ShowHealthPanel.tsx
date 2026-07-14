'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ShowListItem } from './ShowsList';

interface Issue {
  key: string;
  label: string;
}

// "Close to the date" threshold for the zero-RSVPs check.
const RSVP_WARNING_WINDOW_DAYS = 7;

function daysUntil(today: string, date: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Computes every issue that currently applies to a show, regardless of
// whether it's been dismissed — dismissal is filtered separately so a
// dismissed-but-still-true issue can still be shown (and undone) below.
function computeIssues(show: ShowListItem, today: string): Issue[] {
  const issues: Issue[] = [];
  if (!show.announced) issues.push({ key: 'draft', label: 'Draft — not announced' });
  if (!show.sound_engineer_name?.trim()) issues.push({ key: 'sound', label: 'No sound engineer' });
  if (!show.flyer?.trim()) issues.push({ key: 'flyer', label: 'No flyer' });
  if (show.rsvp_form === false) issues.push({ key: 'rsvp-off', label: 'RSVP form disabled' });
  if (!show.advance_sent) issues.push({ key: 'advance', label: 'Not advanced yet' });

  const bandsNeeded = (show.target_band_count ?? 3) - (show.band_count ?? 0);
  if (bandsNeeded > 0) {
    issues.push({ key: 'bands', label: `Need ${bandsNeeded} band${bandsNeeded === 1 ? '' : 's'}` });
  }

  const days = daysUntil(today, show.date);
  if (
    show.announced &&
    show.rsvp_form !== false &&
    days >= 0 &&
    days <= RSVP_WARNING_WINDOW_DAYS &&
    !show.rsvp_count
  ) {
    issues.push({ key: 'no-rsvps', label: `No RSVPs yet (${days}d out)` });
  }
  return issues;
}

export default function ShowHealthPanel({ shows: initialShows, today }: { shows: ShowListItem[]; today: string }) {
  const [shows, setShows] = useState(initialShows);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rows = useMemo(() => {
    return shows
      .filter((s) => s.date >= today)
      .map((show) => {
        const ignored = new Set(show.ignored_health_checks ?? []);
        const all = computeIssues(show, today);
        return {
          show,
          activeIssues: all.filter((i) => !ignored.has(i.key)),
          dismissedIssues: all.filter((i) => ignored.has(i.key)),
        };
      })
      .sort((a, b) => a.show.date.localeCompare(b.show.date));
  }, [shows, today]);

  const flagged = rows.filter((r) => r.activeIssues.length > 0);
  const dismissed = rows.filter((r) => r.dismissedIssues.length > 0);

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

  function dismiss(show: ShowListItem, key: string) {
    const current = show.ignored_health_checks ?? [];
    if (current.includes(key)) return;
    setIgnored(show.id, [...current, key]);
  }

  function undismiss(show: ShowListItem, key: string) {
    const current = show.ignored_health_checks ?? [];
    setIgnored(show.id, current.filter((k) => k !== key));
  }

  return (
    <div className="mb-6 space-y-2">
      {errorMessage && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      {flagged.length === 0 ? (
        <div className="border border-green-400/30 bg-green-400/5 text-green-300 text-sm rounded-lg px-4 py-3">
          All upcoming shows look ready — no outstanding issues.
        </div>
      ) : (
        <div className="border border-amber-400/30 bg-amber-400/5 rounded-lg px-4 py-3">
          <h2 className="text-xs uppercase tracking-wide text-amber-300/80 mb-3">
            Needs attention <span className="text-amber-300/50">({flagged.length})</span>
          </h2>
          <div className="space-y-2">
            {flagged.map(({ show, activeIssues }) => (
              <div key={show.id} className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono text-[#E8E0D0]/50">{show.date}</span>
                  <span className="font-semibold">{show.title}</span>
                  {activeIssues.map((issue) => (
                    <span
                      key={issue.key}
                      className="flex items-center gap-1.5 text-xs pl-2 pr-1 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap"
                    >
                      {issue.label}
                      <button
                        type="button"
                        onClick={() => dismiss(show, issue.key)}
                        title="Not an issue for this show"
                        className="text-amber-300/50 hover:text-amber-300 leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <Link href={`/admin/shows/${show.id}`} className="text-sm text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                  Edit
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {dismissed.length > 0 && (
        <details className="text-xs text-[#E8E0D0]/40">
          <summary className="cursor-pointer select-none uppercase tracking-wide">
            Dismissed ({dismissed.reduce((n, r) => n + r.dismissedIssues.length, 0)})
          </summary>
          <div className="mt-2 space-y-1.5">
            {dismissed.flatMap(({ show, dismissedIssues }) =>
              dismissedIssues.map((issue) => (
                <div key={`${show.id}-${issue.key}`} className="flex items-center justify-between gap-4">
                  <span>
                    {show.date} · {show.title} — {issue.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => undismiss(show, issue.key)}
                    className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline"
                  >
                    Undo
                  </button>
                </div>
              ))
            )}
          </div>
        </details>
      )}
    </div>
  );
}
