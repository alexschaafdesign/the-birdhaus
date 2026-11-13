'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORM } from '@/components/night/form';

// The one button on the email-link confirm page (plus an optional reason when
// declining). The POST is what acts; opening the page never does.
export default function ReviewActions({
  token,
  action,
  count,
}: {
  token: string;
  action: 'approve' | 'decline';
  count: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rehearsal/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'That didn’t work — try again.');
        return;
      }
      const n = data.changed.length;
      const what = `${n} block${n === 1 ? '' : 's'}`;
      setDone(
        `${action === 'approve' ? 'Approved' : 'Declined'} ${what}. ` +
          (data.emailed ? 'The band has been emailed.' : 'The email to the band didn’t go out — resend it from Requests in admin.'),
      );
      router.refresh();
    } catch {
      setError('That didn’t work — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className={FORM.notice}>
        {done}
      </p>
    );
  }

  const label = action === 'approve' ? (count === 1 ? 'Approve' : `Approve all ${count}`) : count === 1 ? 'Decline' : `Decline all ${count}`;
  return (
    <form onSubmit={go} className="flex flex-col gap-4">
      {action === 'decline' && (
        <div>
          <label htmlFor="reason" className={FORM.label}>
            Reason for the band (optional)
          </label>
          <textarea
            id="reason"
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We've got a recording session that week — any other week works."
            className={FORM.field}
          />
        </div>
      )}
      {error && (
        <p role="alert" className={FORM.error}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={FORM.primary}>
        {busy ? 'Working…' : label}
      </button>
    </form>
  );
}
