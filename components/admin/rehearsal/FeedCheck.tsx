'use client';

import { useState } from 'react';

// "Check calendars now": refetches the saved feeds (skipping the 15-minute
// cache) and shows whether each could be read, how many busy times it has in
// the booking window, and how many blocks are open. Never shows titles.

interface FeedRow {
  feed: string;
  ok: boolean;
  error: string;
  busyCount: number;
  fetchedAt: string;
}

interface Result {
  calendarChecked: boolean;
  counts: Record<string, number>;
  feeds: FeedRow[];
}

const ERROR_TEXT: Record<string, string> = {
  timeout: 'timed out',
  network: "couldn't connect",
  parse: "isn't a calendar (link may be wrong or no longer public)",
  too_large: 'too large',
};

const COUNT_LABELS: Array<[string, string]> = [
  ['open', 'open'],
  ['busy', 'busy (calendar)'],
  ['show', 'show days'],
  ['unavailable_day', 'Not available days'],
  ['blackout', 'blackouts'],
  ['booked', 'booked'],
  ['window', 'outside the window'],
  ['past', 'past'],
];

export default function FeedCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/rehearsal/availability?refresh=1', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `Check failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[#E8E0D0]/10 pt-3">
      <button
        type="button"
        onClick={check}
        disabled={loading}
        className="rounded border border-[#E8E0D0]/30 px-3 py-1 text-sm hover:border-[#E8E0D0]/60 disabled:opacity-40"
      >
        {loading ? 'Checking…' : 'Check saved calendars now'}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {result && (
        <div className="space-y-2 text-sm">
          {result.feeds.length === 0 && <p className="text-[#E8E0D0]/50">No saved feeds to check.</p>}
          <ul className="space-y-1">
            {result.feeds.map((f, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <code className="text-[#E8E0D0]/70">{f.feed}</code>
                {f.ok ? (
                  <span className="text-emerald-300">
                    read · {f.busyCount} busy time{f.busyCount === 1 ? '' : 's'} in range
                  </span>
                ) : (
                  <span className="text-red-300">
                    failed: {ERROR_TEXT[f.error] ?? f.error.replace('http_', 'HTTP ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!result.calendarChecked && (
            <p className="text-amber-300">
              A feed couldn&apos;t be read, so its busy times aren&apos;t removing any blocks right now.
            </p>
          )}
          <p className="text-[#E8E0D0]/50">
            Blocks today through the window:{' '}
            {COUNT_LABELS.filter(([k]) => result.counts[k])
              .map(([k, label]) => `${result.counts[k]} ${label}`)
              .join(' · ') || 'none (add standing hours)'}
          </p>
        </div>
      )}
    </div>
  );
}
