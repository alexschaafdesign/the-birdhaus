'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The round's cover image. Everyone sees it; the admin gets upload/replace/
// remove controls. Uploads go through the shared admin image route (resize +
// re-encode into the 'song-club' folder), then the returned URL is saved on
// the playlist via PATCH.
export default function RoundCover({
  playlistId,
  imageUrl,
  isAdmin,
}: {
  playlistId: number;
  imageUrl: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(newUrl: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: newUrl ?? '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      }
      setUrl(newUrl);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'song-club');
      const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Upload failed');
      await save(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setBusy(false);
    }
  }

  // Non-admins: just the image (or nothing).
  if (!isAdmin) {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="mb-4 w-full max-w-sm rounded-lg border border-[#E8E0D0]/15 object-cover"
      />
    ) : null;
  }

  return (
    <div className="mb-4">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="w-full max-w-sm rounded-lg border border-[#E8E0D0]/15 object-cover"
        />
      )}
      <div className="mt-2 flex items-center gap-3 text-xs">
        <label className="cursor-pointer text-[#c8a26a]/80 underline-offset-2 hover:text-[#c8a26a] hover:underline">
          {busy ? 'Working…' : url ? 'Replace cover' : 'Add a cover image'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(null)}
            className="text-[#E8E0D0]/45 underline-offset-2 hover:text-[#F5A3A3] hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-[#F5A3A3]">{error}</p>}
    </div>
  );
}
