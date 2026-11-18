'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClassName } from '@/components/admin/ui';

// Runs the rehearsal daily job on demand (staging has no cron) and shows
// what it did.
export default function RunDailyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!confirm('Run the daily job now? It expires lapsed requests, sends reminders, checks conflicts and emails you the morning summary.')) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/rehearsal/run-daily', { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) return setResult(`Failed (${res.status})`);
      setResult(
        `Expired ${d.expired} (emails ${d.expiryEmails}) · series dates added ${d.seriesBooked}, skipped ${d.seriesSkipped}` +
          ` · reminders ${d.reminders} · new conflicts ${d.newConflicts}` +
          ` · cleared ${d.clearedConflicts} · morning email: ${d.morningEmail}` +
          (d.calendarChecked ? '' : ' · calendar NOT checked'),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-body-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`${buttonClassName('secondary', 's')} disabled:opacity-40`}
      >
        {busy ? 'Running…' : 'Run daily job now'}
      </button>
      <span className="text-surface-ink/60">{result ?? 'Runs by itself every morning ~7am on production.'}</span>
    </div>
  );
}
