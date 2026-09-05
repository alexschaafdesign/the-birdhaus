'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Admin-only (v1): create a round. Collapsed behind a "+ New round" link.
export default function NewPlaylistForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/club/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't create (${res.status})`);
      router.push(`/song-club/music/${data.playlist.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[#c8a26a]/80 underline-offset-2 transition hover:text-[#c8a26a] hover:underline"
      >
        + New round
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 w-full space-y-2 rounded-lg border border-[#c8a26a]/30 bg-[#c8a26a]/[0.04] p-3"
    >
      <input
        type="text"
        required
        autoFocus
        placeholder='Round title — e.g. "SOD #5 // OCT 2026"'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
      />
      <textarea
        rows={2}
        placeholder="Prompt / description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full resize-y rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
      />
      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-4 py-1.5 text-sm font-medium text-[#2A2420] transition-colors hover:bg-[#E8E0D0]/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create round'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
