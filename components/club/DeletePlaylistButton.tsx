'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only: delete a playlist. Songs survive (they fall back to Singles).
export default function DeletePlaylistButton({ playlistId }: { playlistId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm('Delete this playlist? The songs themselves stay (under Singles).')) return;
    setBusy(true);
    const res = await fetch(`/api/club/playlists/${playlistId}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/song-club');
      router.refresh();
    } else {
      setBusy(false);
      alert("Couldn't delete the playlist.");
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-xs text-[#F5A3A3]/70 underline-offset-2 transition hover:text-[#F5A3A3] hover:underline disabled:opacity-50"
    >
      Delete playlist
    </button>
  );
}
