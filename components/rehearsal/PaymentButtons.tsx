'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// One-click payment status for a confirmed session: "Mark paid (venmo)" /
// "Comp" while unpaid, else the status with an undo. Posts to the admin route
// (requireAdmin), so it only works for a signed-in admin; pages render it
// only then. `look` matches the page: the dark admin shell or the 2027 paper.

type Status = 'unpaid' | 'paid' | 'comped' | 'refunded';

const LOOKS = {
  admin: {
    primary:
      'rounded border border-[#E8E0D0] bg-[#E8E0D0] px-3 py-1 text-xs text-[#2A2420] hover:bg-[#E8E0D0]/90 disabled:opacity-40',
    ghost: 'rounded border border-[#E8E0D0]/30 px-3 py-1 text-xs hover:border-[#E8E0D0]/60 disabled:opacity-40',
    paid: 'rounded bg-emerald-400/15 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-emerald-200',
    other: 'rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[#E8E0D0]/70',
    undo: 'text-xs text-[#E8E0D0]/50 underline disabled:opacity-40',
    error: 'text-xs text-red-300',
  },
  paper: {
    primary:
      'bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-data-caption-13 cursor-pointer px-3 py-1 font-bold uppercase disabled:opacity-40',
    ghost:
      'border-surface-ink text-data-caption-13 hover:bg-surface-ink hover:text-surface-paper cursor-pointer border px-3 py-1 uppercase disabled:opacity-40',
    paid: 'text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase',
    other: 'text-data-overline-11 font-bold tracking-[--spacing(0.625)] uppercase opacity-70',
    undo: 'text-data-caption-13 hover:text-accent-red cursor-pointer underline underline-offset-4 disabled:opacity-40',
    error: 'text-data-caption-13 text-accent-red',
  },
} as const;

export default function PaymentButtons({
  id,
  status,
  method,
  look = 'admin',
}: {
  id: number;
  status: Status;
  method: string;
  look?: keyof typeof LOOKS;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = LOOKS[look];

  async function set(next: Status) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rehearsal/bookings/${id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(res.status === 401 ? 'Log in to admin first.' : (data?.error ?? 'Didn’t save — try again.'));
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {status === 'unpaid' ? (
        <>
          <button type="button" disabled={busy} onClick={() => set('paid')} className={s.primary}>
            {busy ? '…' : `Mark paid (${method})`}
          </button>
          <button type="button" disabled={busy} onClick={() => set('comped')} className={s.ghost}>
            Comp
          </button>
        </>
      ) : (
        <>
          <span className={status === 'paid' ? s.paid : s.other}>{status === 'paid' ? `Paid ✓` : status}</span>
          <button type="button" disabled={busy} onClick={() => set('unpaid')} className={s.undo}>
            undo
          </button>
        </>
      )}
      {error && (
        <span role="alert" className={s.error}>
          {error}
        </span>
      )}
    </span>
  );
}
