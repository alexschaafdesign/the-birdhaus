'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// "Cancel" on a confirmed rehearsal in admin: opens a short form with an
// optional note to the band and "Email the band" (upcoming sessions only),
// then cancels just that session. Past ones can be cancelled to fix the record.

export default function CancelBooking({ id, label, started }: { id: number; label: string; started: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(!started);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    const emailing = email && !started;
    if (!confirm(`Cancel ${label}${emailing ? ' and email the band' : ''}? This frees the slot.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rehearsal/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailing, reason }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setError(d?.error ?? "Didn't cancel.");
      if (emailing && !d.emailed) alert('Cancelled, but the email to the band did not go out. Let them know yourself.');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`text-data-caption-13 ${ADMIN_TYPE.link} hover:text-accent-red`}>
        Cancel
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 border border-surface-ink p-3">
      <p className="text-body-3 font-bold">Cancel {label}?</p>
      {!started && (
        <>
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="Note to the band (optional — goes in the email)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${FIELD_INLINE} w-full`}
          />
          <label className="text-body-3 flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-surface-ink size-4" checked={email} onChange={(e) => setEmail(e.target.checked)} />
            Email the band
          </label>
        </>
      )}
      {started && <p className="text-body-3 text-surface-ink/70">Already happened, so no email. Payment stays as marked.</p>}
      <div className="flex items-center gap-4">
        <button type="button" disabled={busy} onClick={cancel} className={buttonClassName('primary', 's')}>
          {busy ? 'Cancelling…' : 'Cancel booking'}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
          Keep it
        </button>
        {error && <span role="alert" className={FORM.error}>{error}</span>}
      </div>
    </div>
  );
}
