'use client';

import { useState } from 'react';
import { buttonClassName } from '@/components/admin/ui';

// Alex's private rehearsal calendar URL: reveal, copy, subscribe, reset.
export default function RehearsalFeedLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load(method: 'GET' | 'POST') {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/rehearsal/calendar-feed', { method, cache: 'no-store' });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.url) setUrl(d.url);
    } finally {
      setBusy(false);
    }
  }

  const small = 'text-data-caption-13 text-surface-ink/60 underline hover:text-accent-red disabled:opacity-40';
  if (!url) {
    return (
      <button type="button" disabled={busy} onClick={() => load('GET')} className={`${buttonClassName('secondary', 's')} disabled:opacity-40`}>
        {busy ? 'Loading…' : 'Show my calendar link'}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <code className="block break-all border border-surface-ink px-3 py-2 text-data-caption-13 text-surface-ink/80">{url}</code>
      <div className="flex flex-wrap gap-4">
        <a href={url.replace(/^https?:/, 'webcal:')} className={small}>
          Add to Apple Calendar
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={small}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm('Reset the link? Calendars subscribed to the old one stop updating.')) load('POST');
          }}
          className="text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline disabled:opacity-40"
        >
          Reset link
        </button>
      </div>
    </div>
  );
}
