'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin control on a round: open or lock uploads. Locked = members can listen
// but not upload (e.g. a Song-a-day that hasn't started yet).
export default function RoundLockToggle({
  playlistId,
  locked,
}: {
  playlistId: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/club/playlists/${playlistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: !locked }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(false);
      alert("Couldn't update the round.");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded-md border border-[#c8a26a]/50 px-3 py-1.5 text-xs font-medium text-[#c8a26a] transition hover:bg-[#c8a26a]/10 disabled:opacity-50"
    >
      {busy ? '…' : locked ? '🔓 Open uploads' : '🔒 Lock uploads'}
    </button>
  );
}
