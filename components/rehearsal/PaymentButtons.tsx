'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// One-click payment status for a confirmed session: "Paid: Venmo · Cash ·
// Card" / "Comp" while unpaid, else the status (and how) with an undo. Posts to the admin route
// (requireAdmin), so it only works for a signed-in admin; pages render it
// only then. `look` matches the page: the 2027 admin or the public paper pages.

type Status = 'unpaid' | 'paid' | 'comped' | 'refunded';
type Provider = 'venmo' | 'cash' | 'square';
const PROVIDERS: Array<[Provider, string]> = [
  ['venmo', 'Venmo'],
  ['cash', 'Cash'],
  ['square', 'Card'],
];

const LOOKS = {
  admin: {
    primary:
      'bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-body-3 cursor-pointer px-3 py-1 font-bold disabled:opacity-40',
    ghost:
      'border-surface-ink text-body-3 ui-hover:bg-surface-ink ui-hover:text-surface-paper cursor-pointer border px-3 py-1 font-bold disabled:opacity-40',
    paid: 'text-data-overline-11 text-surface-ink font-bold tracking-[--spacing(0.25)] uppercase',
    other: 'text-data-overline-11 text-surface-ink/60 font-bold tracking-[--spacing(0.25)] uppercase',
    undo: 'text-data-caption-13 hover:text-accent-red cursor-pointer underline underline-offset-4 disabled:opacity-40',
    error: 'text-data-caption-13 text-accent-red',
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
  provider = null,
  look = 'admin',
}: {
  id: number;
  status: Status;
  method: string; // what the band said they'd use; listed first
  provider?: string | null; // how it was actually paid
  look?: keyof typeof LOOKS;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = LOOKS[look];

  async function set(next: Status, how?: Provider) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rehearsal/bookings/${id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, provider: how }),
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
          <span className={s.other}>Paid:</span>
          {[...PROVIDERS].sort(([a], [b]) => Number(b === method) - Number(a === method)).map(([p, label], i) => (
            <button key={p} type="button" disabled={busy} onClick={() => set('paid', p)} className={i === 0 ? s.primary : s.ghost}>
              {busy ? '…' : label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => set('comped')} className={s.ghost}>
            Comp
          </button>
        </>
      ) : (
        <>
          <span className={status === 'paid' ? s.paid : s.other}>
            {status === 'paid' ? `Paid ✓${provider ? ` · ${PROVIDERS.find(([p]) => p === provider)?.[1] ?? provider}` : ''}` : status}
          </span>
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
