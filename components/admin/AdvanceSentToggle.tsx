'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The Overview's "Advance sent" box. Advancing happens by email outside the
// app, so this is ticked by hand; it sets shows.advance_sent, which clears the
// "Not advanced yet" to-do and starts the input-list check.
export default function AdvanceSentToggle({ showId, sent }: { showId: number; sent: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(sent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle(next: boolean) {
    setChecked(next);
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceSent: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setChecked(!next);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-body-3 text-surface-ink/80">
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(e) => void toggle(e.target.checked)}
        className="h-4 w-4 accent-surface-ink"
      />
      {checked ? 'Sent' : 'Not sent yet'}
      {error && <span className="text-accent-red">— didn&apos;t save</span>}
    </label>
  );
}
