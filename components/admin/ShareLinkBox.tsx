'use client';

import { useState } from 'react';

// The shareable band/engineer "show hub" link, surfaced on the show Details tab.
// The link is unguessable and read-only (headcount-only RSVPs); Regenerate
// rotates it if it's ever over-shared.
export default function ShareLinkBox({
  showId,
  initialUrl,
}: {
  showId: number;
  initialUrl: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  }

  async function regenerate() {
    if (!confirm('Generate a new link? The current one will stop working.')) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${showId}/share`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const d = (await res.json()) as { url: string };
      setUrl(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="border border-surface-ink p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Share with bands &amp; sound engineer
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
        >
          Open ↗
        </a>
      </div>
      <p className="text-data-caption-13 text-surface-ink/60">
        A read-only show page — schedule, input needs, logistics, and RSVP headcount (no attendee info).
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-[16rem] bg-transparent border border-surface-ink  px-3 py-1.5 text-body-3 text-surface-ink/80 focus:outline-none focus:border-accent-red"
        />
        <button
          type="button"
          onClick={copy}
          className="border border-surface-ink px-4 py-1.5 text-body-3 cursor-pointer hover:bg-surface-paper-shade"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={regenerate}
          disabled={regenerating}
          className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline disabled:opacity-40"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
      {error && <p className="text-data-caption-13 text-accent-red">{error}</p>}
    </div>
  );
}
