'use client';

import { useState } from 'react';
import { buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// "Check calendars now": refetches the saved feeds (skipping the 15-minute
// cache) and shows whether each could be read, how many busy times it has in
// the booking window, and how many hours are open. Never shows titles.

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
    <div className="space-y-2 border-t border-surface-ink/20 pt-3">
      <button
        type="button"
        onClick={check}
        disabled={loading}
        className={`${buttonClassName('secondary', 's')} disabled:opacity-40`}
      >
        {loading ? 'Checking…' : 'Check saved calendars now'}
      </button>
      {error && <p role="alert" className={FORM.error}>{error}</p>}
      {result && (
        <div className="space-y-2 text-body-3">
          {result.feeds.length === 0 && <p className="text-surface-ink/60">No saved feeds to check.</p>}
          <ul className="space-y-1">
            {result.feeds.map((f, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <code className="text-surface-ink/70">{f.feed}</code>
                {f.ok ? (
                  <span className="font-bold">
                    ✓ read · {f.busyCount} busy time{f.busyCount === 1 ? '' : 's'} in range
                  </span>
                ) : (
                  <span className="text-accent-red font-bold">
                    ■ failed: {ERROR_TEXT[f.error] ?? f.error.replace('http_', 'HTTP ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!result.calendarChecked && (
            <p className="bg-spectrum-amber text-surface-ink w-fit px-1.5 py-0.5">
              A feed couldn&apos;t be read, so its busy times aren&apos;t blocking any time right now.
            </p>
          )}
          <p className="text-surface-ink/60">
            Hours today through the window:{' '}
            {COUNT_LABELS.filter(([k]) => result.counts[k])
              .map(([k, label]) => `${result.counts[k]} ${label}`)
              .join(' · ') || 'none (check the booking hours)'}
          </p>
        </div>
      )}
    </div>
  );
}
