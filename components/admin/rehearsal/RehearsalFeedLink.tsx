'use client';

import { useState } from 'react';

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

  const small = 'text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0] disabled:opacity-40';
  if (!url) {
    return (
      <button type="button" disabled={busy} onClick={() => load('GET')} className="rounded border border-[#E8E0D0]/30 px-3 py-1 text-xs hover:border-[#E8E0D0]/60">
        {busy ? 'Loading…' : 'Show my calendar link'}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <code className="block break-all rounded border border-[#E8E0D0]/15 px-3 py-2 text-xs text-[#E8E0D0]/80">{url}</code>
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
          className="text-xs text-red-300/80 underline hover:text-red-300 disabled:opacity-40"
        >
          Reset link
        </button>
      </div>
    </div>
  );
}
