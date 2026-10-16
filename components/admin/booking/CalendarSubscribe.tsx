'use client';

import { useState } from 'react';

// Subscribe-in-Apple-Calendar control for the booking toolbar. The URL is a
// secret (see lib/booking-feed.ts), so it stays tucked behind a toggle.
export default function CalendarSubscribe({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webcalUrl = url.replace(/^https?:\/\//, 'webcal://');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Couldn’t copy — select the link and copy it by hand.');
    }
  }

  async function reset() {
    if (!window.confirm('Make a new link? Calendars subscribed to the current one stop updating until you re-subscribe.')) {
      return;
    }
    setResetting(true);
    setError(null);
    const res = await fetch('/api/admin/booking/calendar-feed', { method: 'POST' }).catch(() => null);
    if (res?.ok) setUrl((await res.json()).url);
    else setError('Failed to reset the link.');
    setResetting(false);
  }

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`rounded px-3 py-1.5 font-mono text-sm uppercase tracking-widest transition-colors ${
          open
            ? 'bg-[#E8E0D0] text-[#171412]'
            : 'border border-[#E8E0D0]/30 text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
        }`}
      >
        📅 Subscribe
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-lg border border-[#E8E0D0]/20 bg-[#171412] p-4 text-sm shadow-2xl">
          <p className="text-[#E8E0D0]/70">
            Shows and day titles/notes, refreshed hourly. Anyone with this link can see them — keep it private.
          </p>
          <a
            href={webcalUrl}
            className="block rounded border border-yellow-400/50 px-3 py-2 text-center text-yellow-300 hover:bg-yellow-400/10"
          >
            Open in Apple Calendar
          </a>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Calendar feed URL"
              className="min-w-0 flex-1 rounded border border-[#E8E0D0]/30 bg-transparent px-2 py-1 font-mono text-xs text-[#E8E0D0]/70"
            />
            <button
              onClick={copy}
              className="rounded border border-[#E8E0D0]/30 px-2 py-1 text-xs hover:bg-[#E8E0D0]/10"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-[#E8E0D0]/40">
            On iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste the link.
          </p>
          <button
            onClick={reset}
            disabled={resetting}
            className="text-xs text-[#E8E0D0]/50 underline hover:text-red-400 disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset link'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
