'use client';

import { useState } from 'react';
import { buttonClassName } from '@/components/admin/ui';

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
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={buttonClassName(open ? 'primary' : 'secondary', 's')}
      >
        📅 Subscribe
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3  border border-surface-ink bg-surface-paper p-4 text-body-3 ">
          <p className="text-surface-ink/80">
            Shows and day titles/notes, refreshed hourly. Anyone with this link can see them — keep it private.
          </p>
          <a
            href={webcalUrl}
            className="block  border border-surface-ink px-3 py-2 text-center text-surface-ink hover:bg-surface-paper-shade"
          >
            Open in Apple Calendar
          </a>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Calendar feed URL"
              className="min-w-0 flex-1  border border-surface-ink bg-transparent px-2 py-1  text-data-caption-13 text-surface-ink/80"
            />
            <button
              onClick={copy}
              className="cursor-pointer border border-surface-ink px-2 py-1 text-data-caption-13 hover:bg-surface-paper-shade"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-data-caption-13 text-surface-ink/60">
            On iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste the link.
          </p>
          <button
            onClick={reset}
            disabled={resetting}
            className="text-data-caption-13 text-surface-ink/60 underline hover:text-accent-red disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset link'}
          </button>
          {error && <p className="text-data-caption-13 text-accent-red">{error}</p>}
        </div>
      )}
    </div>
  );
}
